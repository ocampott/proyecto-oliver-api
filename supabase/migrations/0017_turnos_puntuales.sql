-- Turno de UNA fecha exacta, además del patrón semanal recurrente de
-- horarios_empleado — para empleados que trabajan un día que no sigue un
-- patrón semanal fijo (ej. "domingo por medio"). Se suma al horario
-- semanal, no lo reemplaza: calcularCumplimiento/calcularAusencias/
-- calcularLiquidacion los tratan igual que un horario recurrente pero
-- matcheando por fecha exacta en vez de día de semana.
create table turnos_puntuales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  sucursal_id uuid references sucursales (id) on delete set null,
  fecha date not null,
  hora_inicio text not null,
  hora_fin text not null,
  tolerancia_min integer,
  nota text,
  created_at timestamptz not null default now()
);

create index on turnos_puntuales (org_id, empleado_id, fecha);

alter table turnos_puntuales enable row level security;

create policy "members can read their org turnos_puntuales"
  on turnos_puntuales for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));
