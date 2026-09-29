-- Deleting a user from Supabase Auth (the dashboard's "Delete user", or the
-- admin API) failed with "Database error deleting user". profiles.id
-- referenced auth.users ON DELETE CASCADE, so removing the auth user tried to
-- remove the profile — which shipments, notifications, audit logs, COD and
-- proof-of-delivery rows all reference without cascade, so Postgres refused.
--
-- Now the profile outlives its auth user: the cascade is gone, and deleting
-- an auth user anonymises the profile instead (same as delete_staff_account,
-- migration 0023). History keeps pointing at a real row, and the user
-- disappears from Supabase Auth completely.
--
-- One case is still refused, from anywhere: a driver who is mid-delivery or
-- holding collected cash, so no parcel or money is left stranded.

alter table profiles drop constraint if exists profiles_id_fkey;

-- Shared by delete_staff_account() and the auth-deletion trigger. Internal:
-- no EXECUTE grant (0018 made functions un-callable by default).
create function anonymize_profile(p_profile_id uuid, p_deleted_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
begin
  select * into v_profile from profiles where id = p_profile_id for update;
  if not found or v_profile.deleted_at is not null then
    return;
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
  -- details are removed. .invalid is a reserved TLD that never receives mail.
  update profiles
  set active = false,
      deleted_at = now(),
      deleted_by = p_deleted_by,
      email = 'deleted-' || p_profile_id::text || '@deleted.invalid',
      phone = '',
      avatar_url = null
  where id = p_profile_id;

  delete from driver_profiles where profile_id = p_profile_id;
  delete from staff_profiles where profile_id = p_profile_id;
  delete from notifications where profile_id = p_profile_id;
  delete from driver_locations where driver_id = p_profile_id;
  delete from business_account_members where profile_id = p_profile_id;
end;
$$;

revoke execute on function anonymize_profile(uuid, uuid) from public, anon, authenticated;

create or replace function delete_staff_account(p_profile_id uuid)
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

  select * into v_profile from profiles where id = p_profile_id;
  if not found then
    raise exception 'Account not found';
  end if;
  if v_profile.deleted_at is not null then
    raise exception 'This account has already been deleted';
  end if;
  if v_profile.role not in ('operator', 'driver') then
    raise exception 'Only operator and driver accounts can be deleted';
  end if;

  perform anonymize_profile(p_profile_id, auth.uid());
end;
$$;

-- Fires for every auth-user deletion, whatever deleted it.
create function handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform anonymize_profile(old.id, null);
  return old;
end;
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function handle_auth_user_deleted();

-- Accounts deleted through the app before this migration were only
-- soft-deleted in Supabase Auth, so they still appear in the dashboard.
-- Their profiles are already anonymised; remove the auth rows now. Skipped
-- (with a notice) if this role may not delete from auth.users — delete them
-- from the Supabase dashboard instead, which now works.
do $$
begin
  delete from auth.users where id in (select id from public.profiles where deleted_at is not null);
exception
  when insufficient_privilege then
    raise notice 'Could not remove previously deleted accounts from auth.users; delete them from the dashboard.';
end;
$$;
