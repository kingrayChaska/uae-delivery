import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import FieldError from '@/components/ui/field-error';
import AddressAutocomplete from '@/components/maps/address-autocomplete';

import type { UseFormReturn } from 'react-hook-form';
import type { BookingInput } from '@/lib/shipment/schemas';

type LocationStepProps = {
  form: UseFormReturn<BookingInput>;
  field: 'pickup' | 'dropoff';
  title: string;
  addressLabel: string;
  contactNameLabel: string;
};

const LocationStep = ({ form, field, title, addressLabel, contactNameLabel }: LocationStepProps) => {
  const { register, setValue, formState } = form;
  const errors = formState.errors[field];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{title}</h2>

      <AddressAutocomplete
        id={`${field}-address`}
        label={addressLabel}
        placeholder="Search an address"
        onSelect={(result) => {
          setValue(`${field}.address`, result.formattedAddress, { shouldValidate: true });
          setValue(`${field}.lat`, result.coordinates.lat, { shouldValidate: true });
          setValue(`${field}.lng`, result.coordinates.lng, { shouldValidate: true });
        }}
      />
      <FieldError message={errors?.address?.message} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${field}-contactName`}>{contactNameLabel}</Label>
        <Input id={`${field}-contactName`} {...register(`${field}.contactName`)} />
        <FieldError message={errors?.contactName?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${field}-contactPhone`}>Phone number</Label>
        <Input id={`${field}-contactPhone`} type="tel" {...register(`${field}.contactPhone`)} />
        <FieldError message={errors?.contactPhone?.message} />
      </div>
    </div>
  );
};

export default LocationStep;
