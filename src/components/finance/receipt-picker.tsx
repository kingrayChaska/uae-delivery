'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Camera, FileText, ImagePlus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import { shrinkPhoto } from '@/lib/images/shrink-photo';
import { useMessage } from '@/i18n/hooks';
import { MAX_RECEIPTS_PER_EXPENSE, MAX_RECEIPT_BYTES, RECEIPT_IMAGE_TYPES, RECEIPT_TYPES } from '@/lib/finance/receipt-files';

import type { ExpenseReceipt, ReceiptRef } from '@/lib/finance/receipt-files';

// Receipt pictures for the expense form (migration 0053). Each picture is
// sent as soon as it's chosen to /api/expense-receipts, which checks the
// file's real type and size and stores it privately; the form then attaches
// the uploaded files when the expense is saved. What's checked here is only
// early, friendly feedback.

type Status = 'uploading' | 'ready' | 'error';

type Item = {
  key: string;
  status: Status;
  progress: number;
  path: string | null;
  name: string | null;
  contentType: string | null;
  // An object URL (new pictures) or the signed link (saved ones).
  preview: string | null;
  objectUrl: boolean;
  // Already attached to the expense being edited.
  saved: boolean;
  error: string | null;
  // Kept so a failed upload can be retried.
  file: Blob | null;
};

const ENDPOINT = '/api/expense-receipts';
const UPLOAD_FAILED = 'finance.expenses.form.receiptFailed';

const fromSaved = (receipt: ExpenseReceipt): Item => ({
  key: receipt.path,
  status: 'ready',
  progress: 1,
  path: receipt.path,
  name: receipt.name,
  contentType: receipt.contentType,
  preview: receipt.url,
  objectUrl: false,
  saved: true,
  error: null,
  file: null,
});

// Pictures the server won't take as they are (a camera's HEIC, say) are
// redrawn as JPEG; large photos are shrunk; PDFs are sent as they are.
const prepare = async (file: File): Promise<{ blob: Blob; name: string } | { error: string }> => {
  const isPdf = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) return { error: 'finance.expenses.form.receiptType' };
  let blob: Blob = file;
  let name = file.name || 'receipt';
  if (isImage) {
    const accepted = (RECEIPT_IMAGE_TYPES as readonly string[]).includes(file.type);
    blob = await shrinkPhoto(file, { force: !accepted });
    if (!(RECEIPT_TYPES as readonly string[]).includes(blob.type)) return { error: 'finance.expenses.form.receiptType' };
    if (blob !== file) name = name.replace(/\.[^.]*$/, '') + '.jpg';
  }
  if (blob.size > MAX_RECEIPT_BYTES) return { error: 'finance.expenses.form.receiptSize' };
  return { blob, name };
};

// XMLHttpRequest, for upload progress.
const send = (blob: Blob, name: string, onProgress: (fraction: number) => void) =>
  new Promise<{ path: string; contentType: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', ENDPOINT);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { path?: string; contentType?: string; error?: string } | null;
      if (xhr.status === 201 && body?.path && body.contentType) resolve({ path: body.path, contentType: body.contentType });
      else reject(new Error(body?.error ?? UPLOAD_FAILED));
    };
    xhr.onerror = () => reject(new Error('finance.expenses.form.receiptOffline'));
    const form = new FormData();
    form.append('file', blob, name);
    xhr.send(form);
  });

// Removes an upload that was never attached. Best effort: one left behind
// is cleaned up by the server a day later.
const discard = (path: string) => {
  void fetch(`${ENDPOINT}?path=${encodeURIComponent(path)}`, { method: 'DELETE', keepalive: true }).catch(() => undefined);
};

export const useReceiptUploads = (initial: ExpenseReceipt[] = []) => {
  const [items, setItems] = useState<Item[]>(() => initial.map(fromSaved));
  const [changed, setChanged] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // After a save, the uploads belong to the expense: don't discard them.
  const committed = useRef(false);

  const patch = useCallback((key: string, change: Partial<Item>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const release = (item: Item) => {
    if (item.objectUrl && item.preview) URL.revokeObjectURL(item.preview);
    if (!item.saved && item.path) discard(item.path);
  };

  const upload = useCallback(
    async (key: string, file: File) => {
      patch(key, { status: 'uploading', progress: 0, error: null });
      const prepared = await prepare(file);
      if ('error' in prepared) {
        patch(key, { status: 'error', error: prepared.error, file: null });
        return;
      }
      const isImage = prepared.blob.type.startsWith('image/');
      const preview = isImage ? URL.createObjectURL(prepared.blob) : null;
      patch(key, { name: prepared.name, preview, objectUrl: isImage, contentType: prepared.blob.type, file });
      try {
        const result = await send(prepared.blob, prepared.name, (progress) => patch(key, { progress }));
        // Taken off the form while it was uploading: remove it again.
        if (!itemsRef.current.some((item) => item.key === key)) {
          discard(result.path);
          return;
        }
        patch(key, { status: 'ready', progress: 1, path: result.path, contentType: result.contentType, file: null });
      } catch (error) {
        patch(key, { status: 'error', error: error instanceof Error ? error.message : UPLOAD_FAILED });
      }
    },
    [patch],
  );

  const add = (files: FileList | File[]) => {
    setNotice(null);
    const room = MAX_RECEIPTS_PER_EXPENSE - itemsRef.current.length;
    const chosen = Array.from(files);
    if (chosen.length > room) setNotice('finance.validation.tooManyReceipts');
    const accepted = chosen.slice(0, Math.max(0, room));
    if (accepted.length === 0) return;
    const fresh = accepted.map<Item>((file) => ({
      key: crypto.randomUUID(),
      status: 'uploading',
      progress: 0,
      path: null,
      name: file.name,
      contentType: file.type,
      preview: null,
      objectUrl: false,
      saved: false,
      error: null,
      file,
    }));
    setItems((list) => [...list, ...fresh]);
    setChanged(true);
    fresh.forEach((item, index) => void upload(item.key, accepted[index]));
  };

  const remove = (key: string) => {
    setNotice(null);
    const item = itemsRef.current.find((i) => i.key === key);
    if (item) release(item);
    setItems((list) => list.filter((i) => i.key !== key));
    setChanged(true);
  };

  // A different picture in the same place.
  const replace = (key: string, file: File) => {
    const item = itemsRef.current.find((i) => i.key === key);
    if (!item) return;
    release(item);
    const next = crypto.randomUUID();
    setItems((list) =>
      list.map((i) =>
        i.key === key
          ? { ...i, key: next, status: 'uploading', progress: 0, path: null, name: file.name, preview: null, objectUrl: false, saved: false, error: null, file }
          : i,
      ),
    );
    setChanged(true);
    void upload(next, file);
  };

  const retry = (key: string) => {
    const item = itemsRef.current.find((i) => i.key === key);
    if (item?.file instanceof File) void upload(key, item.file);
  };

  // After a successful save: the uploads are now the expense's.
  const commit = () => {
    committed.current = true;
    setItems((list) => list.map((i) => ({ ...i, saved: true })));
    setChanged(false);
  };

  // After a new expense was saved: an empty picker for the next one.
  const reset = () => {
    for (const item of itemsRef.current) if (item.objectUrl && item.preview) URL.revokeObjectURL(item.preview);
    committed.current = false;
    itemsRef.current = [];
    setItems([]);
    setChanged(false);
    setNotice(null);
  };

  // Leaving the form without saving: unattached uploads are removed.
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.objectUrl && item.preview) URL.revokeObjectURL(item.preview);
        if (!committed.current && !item.saved && item.path) discard(item.path);
      }
    },
    [],
  );

  const receipts: ReceiptRef[] = items.filter((i) => i.status === 'ready' && i.path).map((i) => ({ path: i.path!, name: i.name }));

  return {
    items,
    changed,
    notice,
    receipts,
    busy: items.some((i) => i.status === 'uploading'),
    failed: items.some((i) => i.status === 'error'),
    add,
    remove,
    replace,
    retry,
    commit,
    reset,
  };
};

export type ReceiptUploads = ReturnType<typeof useReceiptUploads>;

const ACCEPT = RECEIPT_TYPES.join(',');

const ReceiptPicker = ({ uploads, disabled }: { uploads: ReceiptUploads; disabled?: boolean }) => {
  const t = useTranslations('finance.receipts');
  const translate = useMessage();
  const ids = useId();
  const chooseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const full = uploads.items.length >= MAX_RECEIPTS_PER_EXPENSE;

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${ids}-hint`}>
      <legend className="text-sm font-medium">{t('heading')}</legend>
      <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
        {t('hint', { max: MAX_RECEIPTS_PER_EXPENSE })}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || full} onClick={() => chooseRef.current?.click()}>
          <ImagePlus aria-hidden />
          {t('choose')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || full} onClick={() => cameraRef.current?.click()}>
          <Camera aria-hidden />
          {t('camera')}
        </Button>
      </div>
      <input
        ref={chooseRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) uploads.add(e.target.files);
          e.target.value = '';
        }}
      />
      {/* On phones, opens the camera; elsewhere, a file chooser. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) uploads.add(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replacing) uploads.replace(replacing, file);
          setReplacing(null);
          e.target.value = '';
        }}
      />

      {uploads.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {uploads.items.map((item, index) => {
            const isPdf = item.contentType === 'application/pdf';
            const label = item.name ?? t('untitled', { number: index + 1 });
            return (
              <li key={item.key} className="flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-2">
                <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
                  {item.preview && !isPdf ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local object URL or a signed Storage URL
                    <img src={item.preview} alt={t('previewAlt', { number: index + 1 })} className="size-full object-cover" />
                  ) : (
                    <FileText className="size-8 text-muted-foreground" aria-hidden />
                  )}
                  {item.status === 'uploading' ? (
                    <div className="absolute inset-x-2 bottom-2">
                      <div
                        role="progressbar"
                        aria-label={t('uploading', { name: label })}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(item.progress * 100)}
                        className="h-1.5 overflow-hidden rounded-full bg-background/80"
                      >
                        <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>
                <p className="truncate text-xs" title={label}>
                  {label}
                </p>
                <p
                  className={`text-xs ${item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
                  role={item.status === 'error' ? 'alert' : undefined}
                >
                  {item.status === 'uploading'
                    ? t('progress', { percent: Math.round(item.progress * 100) })
                    : item.status === 'error'
                      ? translate(item.error ?? UPLOAD_FAILED)
                      : item.saved
                        ? t('attached')
                        : t('uploaded')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {item.status === 'error' && item.file instanceof File ? (
                    <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => uploads.retry(item.key)}>
                      <RotateCcw aria-hidden />
                      {t('retry')}
                    </Button>
                  ) : null}
                  {item.status !== 'uploading' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      aria-label={t('replaceLabel', { name: label })}
                      onClick={() => {
                        setReplacing(item.key);
                        replaceRef.current?.click();
                      }}
                    >
                      <RefreshCw aria-hidden />
                      {t('replace')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="text-destructive hover:text-destructive"
                    aria-label={t('removeLabel', { name: label })}
                    onClick={() => uploads.remove(item.key)}
                  >
                    <Trash2 aria-hidden />
                    {t('remove')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {uploads.notice ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {translate(uploads.notice)}
        </p>
      ) : null}
    </fieldset>
  );
};

export default ReceiptPicker;
