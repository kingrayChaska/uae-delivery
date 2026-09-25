'use client';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import Label from '@/components/ui/label';
import Select from '@/components/ui/select';
import Checkbox from '@/components/ui/checkbox';
import FieldError from '@/components/ui/field-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BULK_COLUMNS, BULK_MAX_ROWS } from '@/lib/business/schemas';
import { todayInUae } from '@/lib/bulk/schemas';
import { PACKAGE_TYPES } from '@/lib/types';
import { useBulkListForm } from '@/lib/hooks/use-bulk-list-form';

import type { BulkListRow } from '@/lib/hooks/use-bulk-list-form';
import type { BulkRecord } from '@/lib/bulk/schemas';

type BulkListFormProps = {
  businesses: { id: string; companyName: string }[];
};

// Pickup columns left blank mean "use the list's default pickup".
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(
  `${BULK_COLUMNS.join(',')}\n,,,Mall of the Emirates,Sara Ahmed,0507654321,parcel,Shoes (2 pairs),2,1.2,no,cod\n,,,"Villa 12, Al Barsha 2",Omar Khalid,0509876543,fragile,Glassware,1,3,yes,cod\n`,
)}`;

const TEXTAREA_CLASS =
  'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30';

type RowFieldProps = {
  row: BulkListRow;
  column: keyof BulkRecord;
  label: string;
  onChange: (key: string, column: keyof BulkRecord, value: string) => void;
  className?: string;
  type?: string;
  placeholder?: string;
};

const RowField = ({ row, column, label, onChange, className = '', type = 'text', placeholder }: RowFieldProps) => {
  const id = `${row.key}-${column}`;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={row.record[column]}
        placeholder={placeholder}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 'any' : undefined}
        onChange={(event) => onChange(row.key, column, event.target.value)}
      />
    </div>
  );
};

const BulkListForm = ({ businesses }: BulkListFormProps) => {
  const {
    details,
    pickup,
    rows,
    validCount,
    filledCount,
    rowError,
    importMessage,
    submitError,
    isSubmitting,
    updateDetails,
    updatePickup,
    updateRow,
    toggleCustomPickup,
    addRow,
    duplicateRow,
    removeRow,
    importCsv,
    submit,
  } = useBulkListForm();

  const atLimit = rows.length >= BULK_MAX_ROWS;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>List details</CardTitle>
          <CardDescription>Our operations team sees this with every shipment in the list.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-name">List name</Label>
            <Input
              id="batch-name"
              value={details.name}
              placeholder="e.g. Weekly store restock — Dubai"
              onChange={(event) => updateDetails('name', event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-date">Preferred pickup date</Label>
            <Input
              id="batch-date"
              type="date"
              min={todayInUae()}
              value={details.pickupDate}
              onChange={(event) => updateDetails('pickupDate', event.target.value)}
            />
          </div>
          {businesses.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-business">Book under</Label>
              <Select
                id="batch-business"
                value={details.businessAccountId}
                onChange={(event) => updateDetails('businessAccountId', event.target.value)}
              >
                <option value="">My personal account</option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.companyName}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="batch-notes">Notes for our team (optional)</Label>
            <textarea
              id="batch-notes"
              className={TEXTAREA_CLASS}
              maxLength={1000}
              value={details.notes}
              placeholder="Loading dock, opening hours, handling instructions…"
              onChange={(event) => updateDetails('notes', event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pickup location</CardTitle>
          <CardDescription>
            Where our drivers collect from. Used for every shipment unless you give a shipment its own pickup.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="pickup-address">Address</Label>
            <Input
              id="pickup-address"
              value={pickup.pickup_address}
              placeholder="Warehouse 4, Al Quoz Industrial Area 3, Dubai"
              onChange={(event) => updatePickup('pickup_address', event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pickup-name">Contact name</Label>
            <Input
              id="pickup-name"
              value={pickup.pickup_contact_name}
              onChange={(event) => updatePickup('pickup_contact_name', event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pickup-phone">Contact phone</Label>
            <Input
              id="pickup-phone"
              type="tel"
              value={pickup.pickup_contact_phone}
              onChange={(event) => updatePickup('pickup_contact_phone', event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Shipments ({rows.length}/{BULK_MAX_ROWS})
          </CardTitle>
          <CardDescription>
            Add each parcel by hand, or import a spreadsheet saved as CSV.{' '}
            <a href={TEMPLATE_HREF} download="bulk-shipments-template.csv" className="underline">
              Download the template
            </a>
            . Leave the pickup columns empty to use the pickup location above.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label
              htmlFor="bulk-csv"
              className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-secondary/60"
            >
              Import CSV
            </Label>
            <input
              id="bulk-csv"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importCsv(file);
                event.target.value = '';
              }}
            />
            <Button type="button" variant="outline" onClick={addRow} disabled={atLimit}>
              Add shipment
            </Button>
          </div>
          {importMessage ? (
            <p className={`text-sm ${importMessage.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
              {importMessage.text}
            </p>
          ) : null}

          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => {
              const error = rowError(row);
              return (
                <li key={row.key} className={`rounded-md border p-4 ${error ? 'border-destructive/50' : ''}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Shipment {index + 1}</p>
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => toggleCustomPickup(row.key)}>
                        {row.customPickup ? 'Use default pickup' : 'Different pickup'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => duplicateRow(row.key)} disabled={atLimit}>
                        Duplicate
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(row.key)}>
                        Remove
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {row.customPickup ? (
                      <>
                        <RowField row={row} column="pickup_address" label="Pickup address" onChange={updateRow} className="sm:col-span-2" />
                        <RowField row={row} column="pickup_contact_name" label="Pickup contact" onChange={updateRow} />
                        <RowField row={row} column="pickup_contact_phone" label="Pickup phone" type="tel" onChange={updateRow} />
                      </>
                    ) : null}
                    <RowField
                      row={row}
                      column="dropoff_address"
                      label="Delivery address"
                      placeholder="Building, street, area, emirate"
                      onChange={updateRow}
                      className="sm:col-span-2"
                    />
                    <RowField row={row} column="dropoff_contact_name" label="Recipient name" onChange={updateRow} />
                    <RowField row={row} column="dropoff_contact_phone" label="Recipient phone" type="tel" onChange={updateRow} />
                    <RowField
                      row={row}
                      column="package_description"
                      label="What's inside"
                      placeholder="e.g. 3 × cotton t-shirts"
                      onChange={updateRow}
                      className="sm:col-span-2"
                    />
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`${row.key}-type`} className="text-xs font-normal text-muted-foreground">
                        Package type
                      </Label>
                      <Select
                        id={`${row.key}-type`}
                        value={row.record.package_type}
                        onChange={(event) => updateRow(row.key, 'package_type', event.target.value)}
                      >
                        {PACKAGE_TYPES.map((type) => (
                          <option key={type} value={type} className="capitalize">
                            {type}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`${row.key}-payment`} className="text-xs font-normal text-muted-foreground">
                        Payment
                      </Label>
                      <Select
                        id={`${row.key}-payment`}
                        value={row.record.payment_method}
                        onChange={(event) => updateRow(row.key, 'payment_method', event.target.value)}
                      >
                        <option value="cod">Cash on delivery</option>
                        <option value="card">Card</option>
                      </Select>
                    </div>
                    <RowField row={row} column="quantity" label="Quantity" type="number" onChange={updateRow} />
                    <RowField row={row} column="weight_kg" label="Weight (kg, optional)" type="number" onChange={updateRow} />
                    <Label className="flex items-center gap-2 self-end pb-2 text-sm font-normal">
                      <Checkbox
                        checked={row.record.fragile === 'yes'}
                        onChange={(event) => updateRow(row.key, 'fragile', event.target.checked ? 'yes' : 'no')}
                      />
                      Fragile
                    </Label>
                  </div>

                  {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
                </li>
              );
            })}
          </ol>

          <Button type="button" variant="outline" className="self-start" onClick={addRow} disabled={atLimit}>
            Add shipment
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {validCount} of {filledCount} shipments ready. Each one is priced with our standard rates when you submit;
          incomplete shipments are reported back and not created.
        </p>
        <Button type="submit" disabled={isSubmitting || validCount === 0}>
          {isSubmitting ? `Submitting ${validCount} shipments…` : `Submit ${validCount} shipments`}
        </Button>
      </div>
      <FieldError message={submitError ?? undefined} />
      {isSubmitting ? (
        <p className="text-sm text-muted-foreground">
          Working out routes and prices for every shipment — this can take up to a minute for a long list.
        </p>
      ) : null}
    </form>
  );
};

export default BulkListForm;
