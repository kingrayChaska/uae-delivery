'use client';

import Link from 'next/link';
import { ArrowLeft, Banknote, CalendarClock, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Eye, LoaderCircle, MapPin, Search, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import StatCard from '@/components/dashboard/stat-card';
import ConfirmButton from '@/components/ui/confirm-button';
import FieldError from '@/components/ui/field-error';
import { Card, CardContent } from '@/components/ui/card';
import BulkRowEditor from '@/components/bulk/merchant/bulk-row-editor';
import RefreshWhile from '@/components/bulk/merchant/refresh-while';
import { REVIEW_FILTERS, REVIEW_SORTS, useBulkReview } from '@/lib/hooks/use-bulk-review';
import { useFormat, useMessage } from '@/i18n/hooks';

import type { ReviewFilter, ReviewSort } from '@/lib/hooks/use-bulk-review';
import type { BulkReviewRow } from '@/services/bulk/merchant-bulk';
import type { PaymentMethod } from '@/lib/types';

type BulkReviewProps = {
  batch: { id: string; reference: string; name: string; pickupAddress: string | null; bookingError: string | null; uploaderName: string };
  initialRows: BulkReviewRow[];
  // When the server read initialRows (rows finished later are synced in).
  loadedAt: string;
  // Another member of the merchant's business: they can look, not change.
  readOnly: boolean;
  // How the delivery fees can be paid (cash only until card payments are live).
  paymentMethods: PaymentMethod[];
};

const STATUS_BADGE = {
  valid: { variant: 'success', icon: CircleCheck },
  warning: { variant: 'warning', icon: TriangleAlert },
  invalid: { variant: 'destructive', icon: CircleAlert },
  pending: { variant: 'secondary', icon: LoaderCircle },
} as const;

// What the merchant uploaded, per row. The pickup address, Next Day and
// COD are the same for the whole batch, so they're shown once above.
const ALL_COLUMNS = ['row', 'recipient', 'phone', 'delivery', 'package', 'quantity', 'weight', 'cod', 'date', 'status', 'problems', 'actions'] as const;

// Stages 2–4: validating → review/fix → confirm & book. Everything shown
// here was worked out by the server; the browser only displays it.
const BulkReview = ({ batch, initialRows, loadedAt, readOnly, paymentMethods }: BulkReviewProps) => {
  const t = useTranslations('bulk');
  const format = useFormat();
  const translate = useMessage();
  const review = useBulkReview(batch.id, initialRows, loadedAt, readOnly);
  const { summary } = review;
  const checked = summary.total - summary.pending;
  const canBook = summary.pending === 0 && summary.bookable > 0 && !review.processing;
  const columns = ALL_COLUMNS.filter((column) => !(readOnly && column === 'actions'));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/customer/bulk" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('review.back')}
      </Link>

      <div>
        <p dir="ltr" className="font-brand-mono text-sm text-muted-foreground rtl:text-right">
          {batch.reference}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('review.title')}</h1>
        <p className="text-muted-foreground">{t('review.subtitle', { file: batch.name })}</p>
      </div>

      {/* Shared by every shipment in the batch */}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="text-sm text-muted-foreground">{t('review.pickup')}</p>
              <p className="font-medium">{batch.pickupAddress ?? '—'}</p>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2 text-sm">
            <li className="flex items-center gap-1.5 rounded-full border bg-secondary/40 px-3 py-1">
              <CalendarClock className="size-4 text-primary" aria-hidden />
              {t('upload.fixedNextDay')}
            </li>
            <li className="flex items-center gap-1.5 rounded-full border bg-secondary/40 px-3 py-1">
              <Banknote className="size-4 text-primary" aria-hidden />
              {t('upload.fixedCod')}
            </li>
          </ul>
        </CardContent>
      </Card>

      {readOnly ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border bg-muted/40 p-4 text-sm">
          <Eye className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>{t('review.readOnly', { name: batch.uploaderName || t('review.someoneElse') })}</p>
          {summary.pending > 0 ? <RefreshWhile seconds={5} /> : null}
        </div>
      ) : null}

      {/* Validating */}
      {summary.pending > 0 || review.processing ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                {t('review.checking', { done: format.number(checked), total: format.number(summary.total) })}
              </span>
              <span className="font-brand-mono text-muted-foreground">{Math.round((checked / Math.max(summary.total, 1)) * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${(checked / Math.max(summary.total, 1)) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{t('review.checkingNote')}</p>
          </CardContent>
        </Card>
      ) : null}
      {review.processError ? (
        <div className="flex flex-wrap items-center gap-3">
          <FieldError message={review.processError} />
          <Button type="button" size="sm" variant="outline" onClick={() => void review.retryProcessing()}>
            {t('review.retry')}
          </Button>
        </div>
      ) : null}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('summary.total')} value={format.number(summary.total)} />
        <StatCard label={t('summary.valid')} value={format.number(summary.valid)} icon={CircleCheck} />
        <StatCard label={t('summary.warnings')} value={format.number(summary.warning)} icon={TriangleAlert} />
        <StatCard label={t('summary.errors')} value={format.number(summary.invalid)} icon={CircleAlert} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="bulk-search">{t('review.search')}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="bulk-search"
              value={review.query}
              onChange={(event) => review.setQuery(event.target.value)}
              placeholder={t('review.searchPlaceholder')}
              className="ps-9"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 lg:w-48">
          <Label htmlFor="bulk-filter">{t('review.show')}</Label>
          <Select id="bulk-filter" value={review.filter} onChange={(event) => review.setFilter(event.target.value as ReviewFilter)}>
            {REVIEW_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {t(`filters.${filter}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 lg:w-48">
          <Label htmlFor="bulk-sort">{t('review.sortBy')}</Label>
          <Select id="bulk-sort" value={review.sort} onChange={(event) => review.setSort(event.target.value as ReviewSort)}>
            {REVIEW_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sorts.${sort}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table — one page of rows at a time */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-275 text-sm">
            <thead className="bg-muted/50 text-start text-xs text-muted-foreground">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 text-start font-medium">
                    {column === 'actions' ? <span className="sr-only">{t('columns.actions')}</span> : t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {review.pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                    {t('review.noMatches')}
                  </td>
                </tr>
              ) : (
                review.pageRows.map((row) => {
                  const badge = STATUS_BADGE[row.status];
                  const Icon = badge.icon;
                  return (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-3 py-2 font-brand-mono text-xs text-muted-foreground">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-medium">{row.input.recipient_name || '—'}</td>
                      <td dir="ltr" className="px-3 py-2 font-brand-mono text-xs whitespace-nowrap rtl:text-right">
                        {row.input.recipient_phone || '—'}
                      </td>
                      <td className="max-w-56 px-3 py-2">
                        <p className="line-clamp-2">{row.deliveryAddress ?? row.input.delivery_address}</p>
                      </td>
                      <td className="max-w-40 px-3 py-2">
                        <p className="line-clamp-2">{row.input.package_description || '—'}</p>
                      </td>
                      <td className="px-3 py-2 font-brand-mono">{row.input.quantity || '—'}</td>
                      <td className="px-3 py-2 font-brand-mono whitespace-nowrap">{row.input.weight_kg ? t('review.weight', { weight: row.input.weight_kg }) : '—'}</td>
                      <td className="px-3 py-2 font-brand-mono whitespace-nowrap">
                        {row.codAmount ? format.money(row.codAmount) : row.input.cod_amount || '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.input.date || '—'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={badge.variant} className="gap-1">
                          <Icon className={`size-3 ${row.status === 'pending' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
                          {t(`status.${row.status}`)}
                        </Badge>
                      </td>
                      <td className="max-w-72 px-3 py-2">
                        <ul className="flex flex-col gap-1">
                          {row.issues.map((issue, index) => (
                            <li key={index} className={issue.severity === 'error' ? 'text-destructive' : ''}>
                              <span className="font-medium">{t(`fields.${issue.field}`)}:</span> {translate(issue.message)}
                            </li>
                          ))}
                        </ul>
                      </td>
                      {readOnly ? null : (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <BulkRowEditor row={row} onSave={review.saveRow} />
                            <ConfirmButton
                              variant="ghost"
                              size="sm"
                              aria-label={t('review.removeRow', { number: row.rowNumber })}
                              title={t('review.removeTitle', { number: row.rowNumber })}
                              description={t('review.removeBody')}
                              confirmLabel={t('review.remove')}
                              confirmVariant="destructive"
                              onConfirm={async () => (await review.removeRow(row.id)) === null}
                            >
                              <Trash2 aria-hidden />
                            </ConfirmButton>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t('review.showing', { count: format.number(review.visibleCount), total: format.number(summary.total) })}</span>
          {review.totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={review.page <= 1} onClick={() => review.setPage(review.page - 1)} aria-label={t('review.previous')}>
                <ChevronLeft className="rtl:rotate-180" aria-hidden />
              </Button>
              <span className="font-brand-mono text-xs">{t('review.page', { page: review.page, pages: review.totalPages })}</span>
              <Button type="button" variant="outline" size="sm" disabled={review.page >= review.totalPages} onClick={() => review.setPage(review.page + 1)} aria-label={t('review.next')}>
                <ChevronRight className="rtl:rotate-180" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Confirm & book */}
      {readOnly ? null : (
        <Card className="sticky bottom-4 z-10 shadow-lg">
          <CardContent className="flex flex-col gap-4 pt-6">
            {batch.bookingError || review.bookError ? <FieldError message={review.bookError ?? batch.bookingError} /> : null}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">{t('book.ready')}</p>
                  <p className="font-brand-mono text-xl font-semibold">{format.number(summary.bookable)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('book.fees')}</p>
                  <p className="font-brand-mono text-xl font-semibold">{format.money(summary.fees)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('book.cod')}</p>
                  <p className="font-brand-mono text-xl font-semibold">{format.money(summary.cod)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bulk-payment">{t('book.payment')}</Label>
                  <Select
                    id="bulk-payment"
                    value={review.paymentMethod}
                    onChange={(event) => review.setPaymentMethod(event.target.value as PaymentMethod)}
                    disabled={review.booking}
                  >
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {t(`book.methods.${method}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <ConfirmButton
                  variant="outline"
                  disabled={review.booking}
                  title={t('book.discardTitle')}
                  description={t('book.discardBody')}
                  confirmLabel={t('book.discard')}
                  confirmVariant="destructive"
                  onConfirm={review.cancel}
                >
                  {t('book.discard')}
                </ConfirmButton>
                <ConfirmButton
                  disabled={!canBook}
                  isPending={review.booking}
                  error={review.bookError}
                  title={t('book.confirmTitle', { count: summary.bookable })}
                  description={
                    <div className="flex flex-col gap-2">
                      <p>{t('book.confirmBody', { count: summary.bookable, fees: format.money(summary.fees), cod: format.money(summary.cod) })}</p>
                      {summary.invalid > 0 ? <p>{t('book.confirmSkipped', { count: summary.invalid })}</p> : null}
                      <p>{t(`book.confirmPayment.${review.paymentMethod}`)}</p>
                    </div>
                  }
                  confirmLabel={t('book.confirm', { count: summary.bookable })}
                  onConfirm={review.book}
                >
                  {t('book.confirm', { count: summary.bookable })}
                </ConfirmButton>
              </div>
            </div>
            {!canBook && summary.pending === 0 && summary.bookable === 0 ? <p className="text-sm text-muted-foreground">{t('book.nothing')}</p> : null}
            {paymentMethods.length === 1 && paymentMethods[0] === 'cod' ? <p className="text-xs text-muted-foreground">{t('book.cashOnly')}</p> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BulkReview;
