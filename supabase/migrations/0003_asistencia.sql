create table sucursales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  nombre text not null,
  lat double precision,
  lon double precision,
  radio_metros integer not null default 100,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table empleados (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  nombre text not null,
  celular text,
  device_token text unique,          -- vínculo dispositivo↔empleado (spec §6)
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table asistencia (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'salida')),
  lat double precision not null,
  lon double precision not null,
  created_at timestamptz not null default now()
);

create table asistencia_rechazada (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  empleado_id uuid references empleados (id) on delete set null,
  sucursal_id uuid references sucursales (id) on delete set null,
  tipo text check (tipo in ('entrada', 'salida')),
  lat double precision,
  lon double precision,
  distancia_metros integer,
  motivo text not null,   -- 'fuera_de_rango' | 'sucursal_sin_gps' | 'nombre_no_encontrado' | 'dispositivo_ya_vinculado'
  resuelto boolean not null default false,
  created_at timestamptz not null default now()
);

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados (id) on delete cascade,
  canal text not null default 'asistencia_web',
  code text not null,               -- texto plano: el admin lo ve para entregárselo al empleado (provisional hasta que el OTP se envíe por WhatsApp)
  intentos integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index on asistencia (org_id, created_at);
create index on asistencia (empleado_id, created_at);

alter table sucursales enable row level security;
alter table empleados enable row level security;
alter table asistencia enable row level security;
alter table asistencia_rechazada enable row level security;
alter table otp_codes enable row level security;

-- Lectura para miembros de la org. Escritura solo desde el servidor con
-- service role (las rutas de API aplican el filtro de org_id explícito).
create policy "members can read their org sucursales"
  on sucursales for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "members can read their org empleados"
  on empleados for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "members can read their org asistencia"
  on asistencia for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "members can read their org asistencia_rechazada"
  on asistencia_rechazada for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

-- otp_codes: sin policies para miembros — solo service role.
