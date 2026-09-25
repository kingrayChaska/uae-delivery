import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';

import type { ComponentProps } from 'react';

type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  error?: string;
};

// Label + input + error in one — keeps the manager forms readable.
const Field = ({ label, error, id, ...props }: FieldProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={Boolean(error)} {...props} />
      <FieldError message={error} />
    </div>
  );
};

export default Field;
