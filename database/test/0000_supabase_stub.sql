-- NOT part of the real migrations. Supabase provides `auth.users` and
-- `auth.uid()` itself; this stub exists only so we can run the app's
-- migrations against a plain local Postgres to catch SQL errors early.
create extension if not exists "pgcrypto";

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.uid', true), '')::uuid;
$$;

-- Supabase creates this publication automatically; plain Postgres doesn't.
create publication supabase_realtime;
