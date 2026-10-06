'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

// The dashboard's toast notifications: short messages about something the
// user just started (a download, an export) that outlive the button that
// started it. Mounted once in app/dashboard/layout.tsx, so a toast survives
// navigating between pages.
//
// Two live regions exist from the first render (screen readers only
// announce changes to a region that was already there): errors are
// assertive (role="alert"), everything else polite (role="status").
// Progress numbers are visual only, so a 200-step progress bar isn't read
// out 200 times.

export type ToastType = 'loading' | 'success' | 'error';

export type ToastOptions = {
  type: ToastType;
  message: string;
  // Visual progress for a loading toast, e.g. { done: 37, total: 200 }.
  progress?: { done: number; total: number };
};

type Toast = ToastOptions & { id: number };

type ToastApi = {
  show: (options: ToastOptions) => number;
  update: (id: number, options: Partial<ToastOptions>) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

// Finished toasts leave on their own; a loading toast stays until updated.
const AUTO_DISMISS_MS = 6000;

export const useToast = (): ToastApi => {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <Toaster>');
  return api;
};

const ICONS = { loading: LoaderCircle, success: CircleCheck, error: CircleAlert } as const;

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => {
  const t = useTranslations('common.actions');
  const Icon = ICONS[toast.type];
  const percent = toast.progress && toast.progress.total > 0 ? Math.round((toast.progress.done / toast.progress.total) * 100) : null;

  return (
    <li
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none',
        toast.type === 'error' && 'border-destructive/50',
        toast.type === 'success' && 'border-success/50',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-5 shrink-0',
          toast.type === 'loading' && 'animate-spin text-primary motion-reduce:animate-none',
          toast.type === 'success' && 'text-success',
          toast.type === 'error' && 'text-destructive',
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-medium wrap-break-word">{toast.message}</p>
        {toast.progress && percent !== null ? (
          <div aria-hidden className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
            </span>
            <span dir="ltr" className="font-brand-mono text-xs text-muted-foreground">
              {toast.progress.done}/{toast.progress.total}
            </span>
          </div>
        ) : null}
      </div>
      {toast.type !== 'loading' ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('close')}
          className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </li>
  );
};

const Toaster = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, type: ToastType) => {
      window.clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      if (type !== 'loading') timers.current.set(id, window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    },
    [dismiss],
  );

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...options, id }]);
      schedule(id, options.type);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: number, options: Partial<ToastOptions>) => {
      setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, ...options } : toast)));
      if (options.type) schedule(id, options.type);
    },
    [schedule],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const api = useMemo(() => ({ show, update, dismiss }), [show, update, dismiss]);
  const region = 'pointer-events-none flex w-full flex-col gap-2';

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:end-4 sm:w-96 print:hidden">
        <ul role="alert" className={region}>
          {toasts
            .filter((toast) => toast.type === 'error')
            .map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
            ))}
        </ul>
        <ul role="status" className={region}>
          {toasts
            .filter((toast) => toast.type !== 'error')
            .map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
            ))}
        </ul>
      </div>
    </ToastContext.Provider>
  );
};

export default Toaster;
