import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { listAllDrivers } from '@/services/drivers/list-all-drivers';


const AVAILABILITY_VARIANT: Record<string, 'success' | 'secondary' | 'default'> = {
  available: 'success',
  busy: 'secondary',
  offline: 'default',
};

const DriversView = async () => {
  const drivers = await listAllDrivers();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Drivers</h1>

      {drivers.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No drivers yet</p>
          <p className="text-sm text-muted-foreground">Drivers are onboarded by a manager.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {drivers.map((driver) => (
            <Card key={driver.id}>
              <CardContent className="flex flex-col gap-3 pt-6 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{driver.fullName}</p>
                    <p className="font-brand-mono text-xs text-muted-foreground">
                      {driver.driverCode} · {driver.phone}
                    </p>
                    {driver.vehicle ? <p className="text-xs text-muted-foreground">{driver.vehicle}</p> : null}
                  </div>
                  <Badge variant={AVAILABILITY_VARIANT[driver.availability]}>{driver.availability}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t pt-3 font-brand-mono text-xs">
                  <div>
                    <p className="text-muted-foreground">Today</p>
                    <p className="text-base">{driver.todayDeliveries}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Week</p>
                    <p className="text-base">{driver.weekDeliveries}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Month</p>
                    <p className="text-base">{driver.monthDeliveries}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Delivered</p>
                    <p className="text-base">{driver.successfulDeliveries}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Failed</p>
                    <p className="text-base">{driver.failedDeliveries}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">COD</p>
                    <p className="text-base">AED {driver.codCollected.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
};

export default DriversView;
