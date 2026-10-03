'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  bookBulkDraftAction,
  cancelBulkDraftAction,
  processBulkDraftAction,
  removeBulkRowAction,
  updateBulkRowAction,
} from '@/lib/bulk/merchant-actions';
import { isBookableStatus } from '@/lib/bulk/merchant-csv';
import { sumPrices } from '@/lib/pricing/calculate';

import type { MerchantRowInput } from '@/lib/bulk/merchant-csv';
import type { BulkReviewRow } from '@/services/bulk/merchant-bulk';
import type { PaymentMethod } from '@/lib/types';

export const REVIEW_FILTERS = ['all', 'bookable', 'valid', 'warning', 'invalid'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];
export const REVIEW_SORTS = ['row', 'status', 'fee', 'distance', 'date'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const REVIEW_PAGE_SIZE = 25;

const STATUS_ORDER = { invalid: 0, warning: 1, pending: 2, valid: 3 } as const;

const merge = (rows: BulkReviewRow[], updates: BulkReviewRow[]) => {
  if (updates.length === 0) return rows;
  const byId = new Map(updates.map((row) => [row.id, row]));
  return rows.map((row) => byId.get(row.id) ?? row);
};

const searchable = (row: BulkReviewRow) =>
  [row.rowNumber, ...Object.values(row.input), row.pickupAddress, row.deliveryAddress].join(' ').toLowerCase();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The review screen's state: the rows (checked in chunks by the server
// until none are pending), search/filter/sort/paging, edits and booking.
// Rows are held in memory; only one page is ever rendered.
// `loadedAt` is when the server read `initialRows`; rows the background
// worker finishes after that are fetched in. `readOnly`: another member
// of the business is looking — no checking, editing or booking.
export const useBulkReview = (batchId: string, initialRows: BulkReviewRow[], loadedAt: string, readOnly = false) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  // A server refresh (e.g. after prices changed) brings new rows.
  const [lastInitial, setLastInitial] = useState(initialRows);
  if (lastInitial !== initialRows) {
    setLastInitial(initialRows);
    setRows(initialRows);
  }

  const [processError, setProcessError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [sort, setSort] = useState<ReviewSort>('row');
  const [page, setPage] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const pending = rows.filter((row) => row.status === 'pending').length;

  // ── Validation loop: one server call per chunk, never per row ──
  const running = useRef(false);
  const syncedAt = useRef(loadedAt);
  const processAll = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setProcessing(true);
    setProcessError(null);
    try {
      for (;;) {
        const result = await processBulkDraftAction(batchId, syncedAt.current);
        if (!result.success) {
          setProcessError(result.error);
          return;
        }
        syncedAt.current = result.syncedAt;
        setRows((current) => merge(current, result.rows));
        if (result.remaining === 0) {
          // Make sure every row on screen is the server's final version.
          router.refresh();
          return;
        }
        // The background worker holds the remaining rows: wait for it.
        if (result.rows.length === 0) await wait(2000);
      }
    } catch {
      setProcessError('bulk.errors.checkFailed');
    } finally {
      running.current = false;
      setProcessing(false);
    }
  }, [batchId, router]);

  const hasPendingOnLoad = initialRows.some((row) => row.status === 'pending');
  useEffect(() => {
    if (!hasPendingOnLoad || readOnly) return;
    // Started from a callback, not the effect body (no cascading render).
    const timer = setTimeout(() => void processAll(), 0);
    return () => clearTimeout(timer);
  }, [hasPendingOnLoad, processAll, readOnly]);

  // Leaving mid-check or mid-booking: ask first.
  useEffect(() => {
    if (!processing && !booking) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [processing, booking]);

  // ── Totals ──
  const summary = useMemo(() => {
    const bookable = rows.filter((row) => isBookableStatus(row.status));
    return {
      total: rows.length,
      valid: rows.filter((row) => row.status === 'valid').length,
      warning: rows.filter((row) => row.status === 'warning').length,
      invalid: rows.filter((row) => row.status === 'invalid').length,
      pending: rows.filter((row) => row.status === 'pending').length,
      bookable: bookable.length,
      fees: sumPrices(bookable.map((row) => row.deliveryFee ?? 0)),
      cod: sumPrices(bookable.map((row) => row.codAmount ?? 0)),
    };
  }, [rows]);

  // ── Search / filter / sort / page ──
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (filter === 'bookable' && !isBookableStatus(row.status)) return false;
      if ((filter === 'valid' || filter === 'warning' || filter === 'invalid') && row.status !== filter) return false;
      return !needle || searchable(row).includes(needle);
    });
    const by: Record<ReviewSort, (a: BulkReviewRow, b: BulkReviewRow) => number> = {
      row: (a, b) => a.rowNumber - b.rowNumber,
      status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.rowNumber - b.rowNumber,
      fee: (a, b) => (b.deliveryFee ?? -1) - (a.deliveryFee ?? -1) || a.rowNumber - b.rowNumber,
      distance: (a, b) => (b.distanceKm ?? -1) - (a.distanceKm ?? -1) || a.rowNumber - b.rowNumber,
      date: (a, b) => a.input.delivery_date.localeCompare(b.input.delivery_date) || a.rowNumber - b.rowNumber,
    };
    return filtered.sort(by[sort]);
  }, [rows, query, filter, sort]);

  const totalPages = Math.max(1, Math.ceil(visible.length / REVIEW_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice((currentPage - 1) * REVIEW_PAGE_SIZE, currentPage * REVIEW_PAGE_SIZE);

  const changeQuery = (value: string) => {
    setQuery(value);
    setPage(1);
  };
  const changeFilter = (value: ReviewFilter) => {
    setFilter(value);
    setPage(1);
  };

  // ── Fixing rows ──
  const saveRow = async (rowId: string, input: MerchantRowInput): Promise<string | null> => {
    const result = await updateBulkRowAction(rowId, input);
    if (!result.success) return result.error;
    setRows((current) => merge(current, [result.row, ...result.affected]));
    return null;
  };

  const removeRow = async (rowId: string): Promise<string | null> => {
    const result = await removeBulkRowAction(rowId);
    if (!result.success) return result.error;
    setRows((current) => merge(current.filter((row) => row.id !== rowId), result.affected));
    return null;
  };

  // ── Booking ──
  const book = async (): Promise<boolean> => {
    setBooking(true);
    setBookError(null);
    try {
      const result = await bookBulkDraftAction(batchId, {
        paymentMethod,
        expectedCount: summary.bookable,
        expectedTotal: summary.fees,
      });
      if (!result.success) {
        setBookError(result.error);
        // Prices or rows may have been updated on the server.
        router.refresh();
        return false;
      }
      router.replace(`/dashboard/customer/bulk/${batchId}?booked=1`);
      router.refresh();
      return true;
    } catch {
      // Network failure: the booking may or may not have gone through. A
      // refresh shows which; booking again is safe (it's idempotent).
      setBookError('bulk.errors.bookingUnknown');
      router.refresh();
      return false;
    } finally {
      setBooking(false);
    }
  };

  const cancel = async (): Promise<boolean> => {
    const result = await cancelBulkDraftAction(batchId);
    if (!result.success) {
      setBookError(result.error);
      return false;
    }
    router.push('/dashboard/customer/bulk');
    router.refresh();
    return true;
  };

  return {
    rows,
    pageRows,
    visibleCount: visible.length,
    page: currentPage,
    totalPages,
    setPage,
    query,
    setQuery: changeQuery,
    filter,
    setFilter: changeFilter,
    sort,
    setSort,
    summary,
    pending,
    processing,
    processError,
    retryProcessing: processAll,
    saveRow,
    removeRow,
    paymentMethod,
    setPaymentMethod,
    book,
    booking,
    bookError,
    cancel,
  };
};
