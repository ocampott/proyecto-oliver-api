create table horarios_empleado (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  sucursal_id uuid references sucursales (id) on delete set null,
  dia_semana integer not null check (dia_semana between 0 and 6),
  hora_inicio text not null,
  hora_fin text not null,
  tolerancia_min integer,
  created_at timestamptz not null default now()
);

create index on horarios_empleado (empleado_id, dia_semana);

create table turno_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  nombre text not null,
  hora_inicio text not null,
  hora_fin text not null,
  dias_semana integer[] not null default '{}',
  tolerancia_min integer,
  created_at timestamptz not null default now(),
  unique (org_id, nombre)
);

alter table org_settings add column tolerancia_min integer not null default 30;

alter table horarios_empleado enable row level security;
alter table turno_templates enable row level security;

create policy "members can read their org horarios_empleado"
  on horarios_empleado for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "members can read their org turno_templates"
  on turno_templates for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));
