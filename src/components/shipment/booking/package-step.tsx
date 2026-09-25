import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import Checkbox from '@/components/ui/checkbox';
import FieldError from '@/components/ui/field-error';
import PackageImageUpload from '@/components/shipment/booking/package-image-upload';
import { PACKAGE_TYPES } from '@/lib/types';

import type { UseFormReturn } from 'react-hook-form';
import type { BookingInput } from '@/lib/shipment/schemas';

const PACKAGE_TYPE_LABELS: Record<(typeof PACKAGE_TYPES)[number], string> = {
  document: 'Document',
  parcel: 'Parcel',
  fragile: 'Fragile item',
  bulk: 'Bulk shipment',
};

type PackageStepProps = {
  form: UseFormReturn<BookingInput>;
  customerId: string;
};

const PackageStep = ({ form, customerId }: PackageStepProps) => {
  const { register, setValue, formState } = form;
  const { errors } = formState;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Package details</h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="packageType">Package type</Label>
        <Select id="packageType" {...register('packageType')}>
          {PACKAGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {PACKAGE_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="packageDescription">Description</Label>
        <Input id="packageDescription" placeholder="What are you sending?" {...register('packageDescription')} />
        <FieldError message={errors.packageDescription?.message} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="packageQuantity">Quantity</Label>
          <Input
            id="packageQuantity"
            type="number"
            min={1}
            {...register('packageQuantity', { valueAsNumber: true })}
          />
          <FieldError message={errors.packageQuantity?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="packageWeightKg">Weight (kg, optional)</Label>
          <Input
            id="packageWeightKg"
            type="number"
            min={0}
            step="0.1"
            {...register('packageWeightKg', {
              // Optional: an empty field means "not provided", not NaN —
              // valueAsNumber would turn '' into NaN and block every booking.
              setValueAs: (value: string) => (value === '' || value == null ? undefined : Number(value)),
            })}
          />
          <FieldError message={errors.packageWeightKg?.message} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...register('isFragile')} />
        This package is fragile
      </label>

      <PackageImageUpload
        customerId={customerId}
        onChange={(path) => setValue('packageImagePath', path)}
      />
    </div>
  );
};

export default PackageStep;
