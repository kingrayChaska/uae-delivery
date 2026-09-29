import { CircleAlert } from 'lucide-react';

// role="alert" so a screen reader announces the problem as soon as it appears.
const FieldError = ({ message, id }: { message?: string; id?: string }) => {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
};

export default FieldError;
