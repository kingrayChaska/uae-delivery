-- NOT part of the real migrations. Supabase Storage provides its own
-- `storage.buckets`/`storage.objects` tables and `storage.foldername()`
-- function; this stub exists only so migration 0012 can be applied and
-- exercised against a local Postgres. It does not attempt to replicate
-- Supabase Storage's actual upload/download API — only enough of the
-- schema for the RLS policies themselves to be checked.
create schema if not exists storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select case
    when array_length(string_to_array(name, '/'), 1) > 1
      then (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
    else array[]::text[]
  end;
$$;
