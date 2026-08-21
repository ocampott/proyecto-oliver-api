create table org_settings (
  org_id uuid primary key references organizations (id) on delete cascade,
  system_prompt text not null default '',
  llm_model text not null default 'openai/gpt-4o-mini',
  bot_name text not null default 'Asistente',
  rrhh_categorias jsonb not null default
    '["Enfermedad", "Motivo Personal", "Licencia", "Urgencia"]'::jsonb
);

alter table org_settings enable row level security;

create policy "members can read their org settings"
  on org_settings for select
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

create policy "members can update their org settings"
  on org_settings for update
  using (org_id in (select org_id from org_members where user_id = auth.uid()));

-- Tabla de superadmins de la plataforma (vos, no un cliente). Sin policies
-- de lectura para clientes: solo se consulta desde el servidor con la
-- service role key.
create table platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table platform_admins enable row level security;
