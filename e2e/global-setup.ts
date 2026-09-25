import { sql, MANAGER, PASSWORD } from './helpers';

// Creates the first manager exactly the way the README's "Creating a
// manager" section tells a real operator to: an auth user created with the
// admin API, then the role granted with SQL as postgres. (The app itself
// refuses to grant the manager role — migration 0016.)
const globalSetup = async () => {
  const gateway = `http://localhost:${process.env.E2E_GATEWAY_PORT ?? 54321}`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

  const response = await fetch(`${gateway}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: MANAGER.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: MANAGER.name, phone: '0500000000' },
    }),
  });
  if (!response.ok) throw new Error(`Could not create manager: ${response.status} ${await response.text()}`);

  sql(`update profiles set role = 'manager' where email = '${MANAGER.email}'`);
  sql(`insert into staff_profiles (profile_id, employee_id) select id, 'MGR-001' from profiles where email = '${MANAGER.email}'`);
};

export default globalSetup;
