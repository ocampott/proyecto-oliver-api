create table suscripciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  plan text not null check (plan in ('basico', 'pro')),
  periodo_meses int not null check (periodo_meses in (1, 3, 12)),
  precio_total numeric(10, 2),
  inicia_at timestamptz not null default now(),
  vence_at timestamptz not null,
  estado text not null default 'activa' check (estado in ('activa', 'vencida', 'cancelada')),
  notas text,
  created_at timestamptz not null default now()
);

create index on suscripciones (org_id, estado);

alter table suscripciones enable row level security;

create policy "members can read their org suscripciones"
  on suscripciones for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

-- El plan gratis es el estado por defecto de una org sin suscripción activa.
-- Normalizamos los valores legacy y el default de la columna.
update organizations set plan = 'gratis' where plan = 'trial';

alter table organizations alter column plan set default 'gratis';
