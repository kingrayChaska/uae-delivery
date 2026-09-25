'use client';

import Button from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAvailabilityToggle } from '@/lib/hooks/use-availability-toggle';

import type { DriverProfileDetail } from '@/services/drivers/get-driver-profile';

const AVAILABILITY_OPTIONS: DriverProfileDetail['availability'][] = ['available', 'busy', 'offline'];

const DriverDetailsCard = ({ detail }: { detail: DriverProfileDetail }) => {
  const { availability, update, isUpdating } = useAvailabilityToggle(detail.availability);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Driver ID</p>
            <p className="font-brand-mono">{detail.driverCode}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">License</p>
            <p className="font-brand-mono">{detail.licenseNumber}</p>
          </div>
          {detail.vehicle ? (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Vehicle</p>
              <p>
                {detail.vehicle.make} {detail.vehicle.model} · {detail.vehicle.plateNumber}
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Availability</p>
          <div className="flex gap-2">
            {AVAILABILITY_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={availability === option ? 'default' : 'outline'}
                disabled={isUpdating}
                onClick={() => update(option)}
                className="capitalize"
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DriverDetailsCard;
