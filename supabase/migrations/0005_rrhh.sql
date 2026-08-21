create table ausencias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  sucursal_id uuid references sucursales (id) on delete set null,
  fecha_desde date not null,
  fecha_hasta date not null,
  motivo text not null,
  detalle text,
  contacto text,
  certificado_pendiente boolean not null default false,
  created_at timestamptz not null default now()
);

create index on ausencias (org_id, fecha_desde);

alter table ausencias enable row level security;

create policy "members can read their org ausencias"
  on ausencias for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));
