-- Adelantos de sueldo: registro por empleado, se descuentan del total en
-- Liquidación. El tope del 20% del sueldo (calculado en la app, no acá) es
-- solo un aviso no bloqueante — por eso no hay check de monto máximo.
create table adelantos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  fecha date not null,
  monto numeric not null check (monto > 0),
  nota text,
  created_at timestamptz not null default now()
);

create index on adelantos (org_id, empleado_id, fecha);

alter table adelantos enable row level security;

create policy "members can read their org adelantos"
  on adelantos for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));
