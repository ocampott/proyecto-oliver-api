create extension if not exists pgcrypto;

-- El stack local del CLI crea las tablas como postgres y sus default
-- privileges no otorgan DML a los roles de la API (anon/authenticated/
-- service_role). Se fijan acá para todas las tablas de negocio del schema
-- public, igual que en Supabase hosted. El aislamiento igual lo garantiza
-- RLS a nivel fila.
alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

create type org_role as enum ('owner', 'admin', 'agent');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

create table org_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  role org_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (user_id, org_id),
  -- v1: un usuario pertenece a una sola organización (spec §8).
  unique (user_id)
);

alter table organizations enable row level security;
alter table org_members enable row level security;

create policy "members can read their own organization"
  on organizations for select
  using (id in (select org_id from org_members where user_id = auth.uid()));

create policy "members can read their own membership"
  on org_members for select
  using (user_id = auth.uid());
