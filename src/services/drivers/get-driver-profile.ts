import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type DriverProfileDetail = {
  driverCode: string;
  licenseNumber: string;
  availability: 'available' | 'busy' | 'offline';
  vehicle: { make: string; model: string; plateNumber: string } | null;
};

export const getDriverProfileDetail = async (profileId: string): Promise<DriverProfileDetail | null> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('driver_profiles')
    .select('driver_code, license_number, availability, vehicles(make, model, plate_number)')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (!data) return null;

  const vehicle = data.vehicles as unknown as { make: string; model: string; plate_number: string } | null;

  return {
    driverCode: data.driver_code,
    licenseNumber: data.license_number,
    availability: data.availability,
    vehicle: vehicle ? { make: vehicle.make, model: vehicle.model, plateNumber: vehicle.plate_number } : null,
  };
};
