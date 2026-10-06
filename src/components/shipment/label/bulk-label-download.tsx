'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Download, LoaderCircle, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { buildLabelsPdf, labelsFileName, saveFile } from '@/lib/labels/build-labels-pdf';

type BulkLabelDownloadProps = {
  reference: string;
  // The labels on this page (one part of the batch).
  count: number;
  part: number;
  parts: number;
  // Start straight away: arriving from the bulk page's "Download all
  // labels" button, so one click gives the file.
  autoStart: boolean;
  // The element holding the rendered labels.
  sheetId: string;
};

type State = 'idle' | 'working' | 'done' | 'failed';

// Downloads this page's labels as one PDF file (lib/labels/build-labels-pdf).
const BulkLabelDownload = ({ reference, count, part, parts, autoStart, sheetId }: BulkLabelDownloadProps) => {
  const t = useTranslations('bulk.labels');
  const toast = useToast();
  const [state, setState] = useState<State>('idle');
  // A ref, not state: a second click in the same frame is ignored.
  const running = useRef(false);
  const started = useRef(false);

  const download = async () => {
    if (running.current) return;
    running.current = true;
    setState('working');
    const id = toast.show({ type: 'loading', message: t('preparing'), progress: { done: 0, total: count } });
    try {
      const sheet = document.getElementById(sheetId);
      const nodes = sheet ? Array.from(sheet.querySelectorAll<HTMLElement>('[data-print-content]')) : [];
      // Exactly the labels the server made, or nothing.
      if (nodes.length !== count) throw new Error(`Expected ${count} labels, found ${nodes.length}`);
      const pdf = await buildLabelsPdf(nodes, {
        onProgress: (done, total) => toast.update(id, { progress: { done, total } }),
      });
      saveFile(pdf, labelsFileName(reference, part, parts));
      toast.update(id, { type: 'success', message: t('downloaded', { count }), progress: undefined });
      setState('done');
    } catch (error) {
      console.error('Bulk label PDF failed', error instanceof Error ? error.message : error);
      toast.update(id, { type: 'error', message: t('failed'), progress: undefined });
      setState('failed');
    } finally {
      running.current = false;
    }
  };

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    // Refreshing or coming Back shouldn't download it again.
    const url = new URL(window.location.href);
    url.searchParams.delete('download');
    window.history.replaceState(window.history.state, '', url);
    void download();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const working = state === 'working';

  return (
    <div className="flex flex-col items-start gap-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" onClick={() => void download()} disabled={working} aria-busy={working}>
          {working ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
          {working ? t('preparing') : state === 'done' ? t('downloadAgain') : t('downloadPdf', { count })}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => window.print()} disabled={working}>
          <Printer aria-hidden />
          {t('printInstead')}
        </Button>
      </div>
      {/* The same outcome as the toast, kept on the page. */}
      {state === 'done' ? (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CircleCheck className="size-4" aria-hidden />
          {t('downloaded', { count })}
        </p>
      ) : state === 'failed' ? (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert className="size-4" aria-hidden />
          {t('failed')}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('ready', { count })}</p>
      )}
    </div>
  );
};

export default BulkLabelDownload;
