-- Liquidación de sueldos, legajos, vacaciones y chat web de RRHH (puerto
-- adaptado del panel single-tenant de referencia, ver plan de trabajo).

-- ── Datos de pago del empleado (fecha_ingreso ya existe desde 0011) ───────
alter table empleados
  add column tipo_pago text check (tipo_pago in ('mensual', 'hora', 'dia')),
  add column sueldo_mensual numeric,
  add column valor_hora numeric,
  add column valor_dia numeric;

-- ── Ausencias: origen (admin vs autoreportada por el empleado vía chat) ───
alter table ausencias
  add column origen text not null default 'admin' check (origen in ('admin', 'empleado'));

-- "Vacaciones" como categoría disponible de motivo, sin que cada org tenga
-- que configurarla a mano — necesaria para que el cálculo de saldo pueda
-- inferir días tomados a partir de ausencias con motivo = 'Vacaciones'.
update org_settings
set rrhh_categorias = rrhh_categorias || '["Vacaciones"]'::jsonb
where not (rrhh_categorias @> '["Vacaciones"]'::jsonb);

alter table org_settings
  alter column rrhh_categorias set default
    '["Enfermedad", "Motivo Personal", "Licencia", "Urgencia", "Vacaciones"]'::jsonb;

-- ── Legajos: archivos por empleado (certificados, documentación) ──────────
create table legajo_archivos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  ausencia_id uuid references ausencias (id) on delete set null,
  nombre_original text not null,
  storage_path text not null,
  mimetype text not null,
  tamanio_bytes integer not null,
  origen text not null check (origen in ('manual', 'chat_empleado')),
  subido_por text,
  created_at timestamptz not null default now()
);

create index on legajo_archivos (empleado_id, created_at);

alter table legajo_archivos enable row level security;

create policy "members can read their org legajo_archivos"
  on legajo_archivos for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

-- Bucket privado de Storage — el acceso pasa siempre por los endpoints
-- Express con el service role, nunca directo desde el cliente.
insert into storage.buckets (id, name, public)
values ('legajos', 'legajos', false)
on conflict (id) do nothing;

-- ── Chat web de RRHH ────────────────────────────────────────────────────
-- Estado del flujo conversacional por empleado (equivalente a flow_state de
-- la fuente, pero indexado por empleado_id en vez de teléfono). Sin
-- policies de lectura para miembros — es estado interno del flujo, no dato
-- de negocio, mismo criterio que otp_codes.
create table rrhh_chat_estado (
  empleado_id uuid primary key references empleados (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  step text not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table rrhh_chat_estado enable row level security;

-- Historial de mensajes del chat, visible para RRHH.
create table rrhh_chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  remitente text not null check (remitente in ('empleado', 'sistema')),
  texto text not null,
  created_at timestamptz not null default now()
);

create index on rrhh_chat_mensajes (empleado_id, created_at);

alter table rrhh_chat_mensajes enable row level security;

create policy "members can read their org rrhh_chat_mensajes"
  on rrhh_chat_mensajes for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));
