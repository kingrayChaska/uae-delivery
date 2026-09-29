import { CircleAlert } from 'lucide-react';

import { useMessage } from '@/i18n/hooks';

// role="alert" so a screen reader announces the problem as soon as it appears.
// Messages from validation schemas and server actions arrive as translation
// keys (i18n/message.ts) and are shown in the reader's language here.
const FieldError = ({ message, id }: { message?: string | null; id?: string }) => {
  const translate = useMessage();
  if (!message) return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{translate(message)}</span>
    </p>
  );
};

export default FieldError;
