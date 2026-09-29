-- Managers can delete operator and driver accounts.
--
-- A profile can't simply be removed: about twenty tables reference it
-- (shipments, proof of delivery, COD records, status history, audit logs,
-- support messages ...), and that history must survive the account. So
-- "delete" here means:
--   * the person can never sign in again (the app also soft-deletes the
--     auth user with the service-role client, after this function succeeds),
--   * their contact details, role-specific records, notifications and
--     location trail are removed,
--   * the profile row stays, marked deleted and inactive, so past
--     deliveries still show who carried them.
-- Deletion is refused while a driver still has deliveries in progress or
-- is holding collected cash — those must be reassigned or reconciled first.
--
-- Also: shipments could be assigned to ANY profile id (a customer, an
-- inactive driver). A trigger now requires an active, non-deleted driver.

alter table profiles
  add column deleted_at timestamptz,
  add column deleted_by uuid references profiles (id);

create index profiles_not_deleted_role_idx on profiles (role) where deleted_at is null;

create function delete_staff_account(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
begin
  if not is_manager() then
    raise exception 'Only a manager can delete staff accounts';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  select * into v_profile from profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Account not found';
  end if;
  if v_profile.deleted_at is not null then
    raise exception 'This account has already been deleted';
  end if;
  if v_profile.role not in ('operator', 'driver') then
    raise exception 'Only operator and driver accounts can be deleted';
  end if;

  if v_profile.role = 'driver' then
    if exists (
      select 1 from shipments
      where driver_id = p_profile_id
        and status in ('assigned', 'driver_accepted', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination')
    ) then
      raise exception 'This driver has deliveries in progress. Reassign or complete them first.';
    end if;
    if exists (select 1 from cod_transactions where driver_id = p_profile_id and status = 'collected') then
      raise exception 'This driver is holding collected cash on delivery. Reconcile it first.';
    end if;
  end if;

  -- The name is kept so delivery and audit history stay readable; contact
  -- details are removed. The placeholder email keeps profiles.email NOT NULL
  -- and can never receive mail (.invalid is a reserved TLD).
  update profiles
  set active = false,
      deleted_at = now(),
      deleted_by = auth.uid(),
      email = 'deleted-' || p_profile_id::text || '@deleted.invalid',
      phone = '',
      avatar_url = null
  where id = p_profile_id;

  -- Role records go, which also frees the driver code / employee ID and
  -- takes the driver off every dispatch and live-map list.
  delete from driver_profiles where profile_id = p_profile_id;
  delete from staff_profiles where profile_id = p_profile_id;
  delete from notifications where profile_id = p_profile_id;
  delete from driver_locations where driver_id = p_profile_id;
end;
$$;

grant execute on function delete_staff_account(uuid) to authenticated;

-- Only an active, non-deleted driver can be given a shipment — whoever
-- assigns it (staff dispatch, reassignment, a direct API call).
create function enforce_shipment_driver_is_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.driver_id is null or (tg_op = 'UPDATE' and new.driver_id is not distinct from old.driver_id) then
    return new;
  end if;

  if not exists (
    select 1 from profiles
    where id = new.driver_id and role = 'driver' and active and deleted_at is null
  ) then
    raise exception 'Shipments can only be assigned to an active driver';
  end if;
  return new;
end;
$$;

create trigger shipments_enforce_driver_is_active
  before insert or update of driver_id on shipments
  for each row execute function enforce_shipment_driver_is_active();
