import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/security/validate';

export type OperatorSummary = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  employeeId: string;
  active: boolean;
  actionsLogged: number;
  assignmentsMade: number;
  lastLoginAt: string | null;
};

// Last-login lives in auth.users, which only the service-role client can
// read — only ever called from manager-guarded pages. Returns a map rather
// than per-user lookups to avoid N round-trips.
export const getLastLoginMap = async (): Promise<Map<string, string | null>> => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return new Map((data?.users ?? []).map((user) => [user.id, user.last_sign_in_at ?? null]));
};

export const listOperators = async (): Promise<OperatorSummary[]> => {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, active, staff_profiles(employee_id)')
    .eq('role', 'operator')
    .is('deleted_at', null)
    .order('full_name');

  if (!rows || rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [{ data: logs }, lastLogins] = await Promise.all([
    supabase.from('audit_logs').select('actor_id, action').in('actor_id', ids),
    getLastLoginMap(),
  ]);

  return rows.map((row) => {
    const staff = row.staff_profiles as unknown as { employee_id: string } | { employee_id: string }[] | null;
    const employeeId = Array.isArray(staff) ? staff[0]?.employee_id : staff?.employee_id;
    const mine = (logs ?? []).filter((log) => log.actor_id === row.id);
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      employeeId: employeeId ?? '—',
      active: row.active,
      actionsLogged: mine.length,
      assignmentsMade: mine.filter((log) => log.action.startsWith('shipment.assign') || log.action.startsWith('shipment.reassign')).length,
      lastLoginAt: lastLogins.get(row.id) ?? null,
    };
  });
};

export type StaffDetail = {
  id: string;
  role: 'operator' | 'driver';
  fullName: string;
  email: string;
  phone: string;
  active: boolean;
  employeeId: string | null;
  driverCode: string | null;
  licenseNumber: string | null;
  vehicle: string | null;
  lastLoginAt: string | null;
  recentActivity: { id: string; action: string; createdAt: string }[];
};

export const getStaffDetail = async (profileId: string): Promise<StaffDetail | null> => {
  // profileId comes from the URL and is interpolated into the .or() filter
  // below — PostgREST filter strings aren't parameterized, so it must be a
  // verified UUID before it gets anywhere near one.
  if (!isUuid(profileId)) return null;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, phone, active, deleted_at')
    .eq('id', profileId)
    .maybeSingle();

  // A deleted account has no detail page (migration 0023).
  if (!profile || !['operator', 'driver'].includes(profile.role) || profile.deleted_at) return null;

  const [{ data: staff }, { data: driver }, { data: logs }, lastLogins] = await Promise.all([
    supabase.from('staff_profiles').select('employee_id').eq('profile_id', profileId).maybeSingle(),
    supabase
      .from('driver_profiles')
      .select('driver_code, license_number, vehicles(make, model, plate_number)')
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabase
      .from('audit_logs')
      .select('id, action, created_at')
      .or(`actor_id.eq.${profileId},entity_id.eq.${profileId}`)
      .order('created_at', { ascending: false })
      .limit(20),
    getLastLoginMap(),
  ]);

  const vehicle = driver?.vehicles as unknown as { make: string; model: string; plate_number: string } | null;

  return {
    id: profile.id,
    role: profile.role as 'operator' | 'driver',
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    active: profile.active,
    employeeId: staff?.employee_id ?? null,
    driverCode: driver?.driver_code ?? null,
    licenseNumber: driver?.license_number ?? null,
    vehicle: vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate_number}` : null,
    lastLoginAt: lastLogins.get(profile.id) ?? null,
    recentActivity: (logs ?? []).map((log) => ({ id: log.id, action: log.action, createdAt: log.created_at })),
  };
};
