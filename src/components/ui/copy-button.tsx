'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import Button from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CopyButtonProps = {
  value: string;
  label?: string;
  // What's being copied, for screen readers: "Copy tracking ID PL7K29X4".
  description?: string;
  className?: string;
};

// Falls back to a hidden textarea where the async Clipboard API isn't
// available (older browsers, or a non-secure http origin in development).
const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('copy failed');
};

const CopyButton = ({ value, label = 'Copy', description, className = '' }: CopyButtonProps) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timeout = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timeout);
  }, [state]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(state === 'copied' ? 'border-success/60 text-success hover:text-success' : '', className)}
        aria-label={description ? `${label} ${description}` : undefined}
        onClick={async () => {
          try {
            await copyText(value);
            setState('copied');
          } catch {
            setState('failed');
          }
        }}
      >
        {state === 'copied' ? (
          <Check className="animate-in zoom-in-50 duration-200 motion-reduce:animate-none" aria-hidden />
        ) : (
          <Copy aria-hidden />
        )}
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Could not copy. Select the text and copy it manually.' : ''}
      </span>
    </>
  );
};

export default CopyButton;
