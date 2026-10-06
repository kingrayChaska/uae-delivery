-- Operator dashboard: shipment categories and customer search.
--
-- 1. staff_shipment_feed. The staff shipments list used to show every
--    shipment as its own row, so a 25-row bulk booking appeared as 25
--    unrelated entries. The feed shows each shipment that is NOT part of a
--    batch, plus each batch (migration 0020) as ONE entry, newest first, so
--    the list can be paged in the database and filtered by category:
--      Individual / Merchant  -> the booking customer's account_type
--      Bulk                   -> kind = 'batch'
--    A batch is a real shipment_batches row — never inferred from a
--    quantity. Drafts and discarded merchant uploads hold no shipments and
--    are left out, as in every other staff list (STAFF_VISIBLE_BATCH_STATUSES).
--    security_invoker: the caller's RLS applies, exactly as for the tables.
--
-- 2. search_customers(). Staff search customers by their own name or by
--    the company name of a business account they belong to (merchants),
--    partial and case-insensitive, paged in the database. Company names are
--    read from business_accounts, which staff can already read — not from
--    merchant_applications, which is managers-only.

-- ── 1. Shipment feed ─────────────────────────────────────────────────────

create view staff_shipment_feed with (security_invoker = true) as
select
  'shipment'::text as kind,
  s.id,
  s.created_at,
  s.customer_id,
  p.account_type
from shipments s
join profiles p on p.id = s.customer_id
where s.batch_id is null
union all
select
  'batch'::text as kind,
  b.id,
  b.created_at,
  b.customer_id,
  p.account_type
from shipment_batches b
join profiles p on p.id = b.customer_id
where b.status in ('processing', 'submitted', 'partially_failed', 'failed');

grant select on staff_shipment_feed to authenticated;
revoke all on staff_shipment_feed from anon;

-- The feed's newest-first scan of single (un-batched) shipments.
create index shipments_unbatched_created_idx on shipments (created_at desc) where batch_id is null;

-- ── 2. Customer search ───────────────────────────────────────────────────

-- Substring search ('%term%') can't use a b-tree index; a trigram index
-- can. Supabase installs extensions into the `extensions` schema, so the
-- operator class is looked up wherever pg_trgm actually lives.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format(
    'create index profiles_customer_name_trgm_idx on profiles using gin (full_name %I.gin_trgm_ops) where role = %L',
    v_schema, 'customer'
  );
  execute format(
    'create index business_accounts_company_name_trgm_idx on business_accounts using gin (company_name %I.gin_trgm_ops)',
    v_schema
  );
end;
$$;

-- p_query is matched literally: LIKE wildcards in it (% and _) and the
-- escape character are escaped, so "50%" finds "50%", not everything.
-- Returns one page plus the total number of matches (total_count, the
-- same on every row). SECURITY INVOKER: profiles/business_accounts RLS
-- still applies, and the explicit staff check means a customer calling it
-- gets nothing rather than just their own row.
create function search_customers(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  active boolean,
  account_type account_type,
  company_name text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      case
        when nullif(btrim(p_query), '') is null then null
        else '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pattern
  ),
  matches as (
    select
      p.id,
      p.full_name,
      p.email,
      p.phone,
      p.active,
      p.account_type,
      company.company_name
    from profiles p
    cross join params
    left join lateral (
      -- A merchant's company: their active business account first.
      select ba.company_name
      from business_account_members m
      join business_accounts ba on ba.id = m.business_account_id
      where m.profile_id = p.id
      order by ba.active desc, m.added_at asc
      limit 1
    ) company on true
    where p.role = 'customer'
      and (select is_staff())
      and (
        params.pattern is null
        or p.full_name ilike params.pattern
        or exists (
          select 1
          from business_account_members m
          join business_accounts ba on ba.id = m.business_account_id
          where m.profile_id = p.id
            and ba.company_name ilike params.pattern
        )
      )
  )
  select
    matches.*,
    count(*) over () as total_count
  from matches
  order by matches.full_name asc, matches.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 500000);
$$;

-- Explicit revoke: 0018's schema-level default can't remove Postgres's
-- built-in EXECUTE-to-PUBLIC on new functions.
revoke execute on function search_customers(text, integer, integer) from public, anon;
grant execute on function search_customers(text, integer, integer) to authenticated;
