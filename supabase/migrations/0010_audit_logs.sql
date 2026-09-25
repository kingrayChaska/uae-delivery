-- audit_logs: every significant administrative action (spec section 32).
-- Deliberately has NO insert/update/delete policy for 'authenticated' — the
-- only way a row gets in here is the service-role client, called from
-- server actions/route handlers that have already verified the actor's
-- role with requireRole(). "Do not allow normal users to modify audit
-- logs" is enforced by there being no client-reachable write path at all,
-- not by a policy a clever request could route around.
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on audit_logs (actor_id);
create index audit_logs_created_at_idx on audit_logs (created_at desc);

alter table audit_logs enable row level security;

-- Staff-only read (Operator + Manager both have an Activity Log nav item).
create policy audit_logs_select on audit_logs
  for select using (is_staff());

-- No insert/update/delete policies at all — see comment above.
