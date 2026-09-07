-- Aplicar junto con el backend/frontend de operación RRHH.
-- Históricos conservan su efecto. Solo solicitudes NUEVAS de empleados quedan pendientes.
begin;

alter table public.ausencias
  add column estado text not null default 'aprobada'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  add column revision integer not null default 1;

alter table public.legajo_archivos
  add column visible_empleado boolean not null default false;
-- Certificados que envió el propio empleado no son documentación interna.
update public.legajo_archivos set visible_empleado = true where origen = 'chat_empleado';

create table public.ausencias_historial (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ausencia_id uuid not null,
  accion text not null,
  actor_id uuid,
  actor_email text,
  comentario text,
  anterior jsonb,
  actual jsonb,
  created_at timestamptz not null default now()
);
create index on public.ausencias_historial(org_id, ausencia_id, created_at desc);
create index on public.ausencias(org_id, estado, fecha_desde);

create function public.auditar_ausencia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.origen = 'empleado' then new.estado := 'pendiente'; end if;
  elsif tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
    -- Una edición sustantiva requiere revisar nuevamente. Adjuntar certificado no.
    if row(new.empleado_id, new.sucursal_id, new.fecha_desde, new.fecha_hasta, new.motivo, new.detalle)
       is distinct from
       row(old.empleado_id, old.sucursal_id, old.fecha_desde, old.fecha_hasta, old.motivo, old.detalle)
    then new.estado := 'pendiente'; end if;
  end if;
  -- La eliminación de la organización ya elimina su historial por FK.
  if not exists(select 1 from public.organizations where id = coalesce(new.org_id, old.org_id)) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  insert into public.ausencias_historial(org_id, ausencia_id, accion, actor_id, actor_email, comentario, anterior, actual)
  values (
    coalesce(new.org_id, old.org_id), coalesce(new.id, old.id), tg_op,
    nullif(current_setting('oliver.actor_id', true), '')::uuid,
    nullif(current_setting('oliver.actor_email', true), ''),
    nullif(current_setting('oliver.comentario', true), ''),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger auditar_ausencia before insert or update or delete on public.ausencias
for each row execute function public.auditar_ausencia();

-- Compare-and-swap y auditoría en UNA transacción; solo API service_role.
create function public.decidir_ausencia(p_org uuid, p_id uuid, p_revision integer,
  p_estado text, p_comentario text, p_actor uuid, p_email text)
returns jsonb language plpgsql set search_path = public as $$
declare resultado public.ausencias;
begin
  if p_estado not in ('aprobada', 'rechazada') or length(trim(coalesce(p_comentario, ''))) < 3
     or length(p_comentario) > 1000 then raise exception 'Decisión inválida' using errcode = '22023'; end if;
  perform set_config('oliver.actor_id', p_actor::text, true);
  perform set_config('oliver.actor_email', coalesce(p_email, ''), true);
  perform set_config('oliver.comentario', p_comentario, true);
  update public.ausencias set estado = p_estado
    where id = p_id and org_id = p_org and revision = p_revision and estado = 'pendiente'
    returning * into resultado;
  if not found then raise exception 'La solicitud cambió o ya fue resuelta' using errcode = '40001'; end if;
  return to_jsonb(resultado);
end $$;

-- Un token de versión por organización. Cualquier fuente del cálculo lo cambia.
create table public.operacion_revision (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  revision uuid not null default gen_random_uuid()
);
insert into public.operacion_revision(org_id) select id from public.organizations;
create table public.operacion_cambios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  tabla text not null, accion text not null, registro_id text,
  created_at timestamptz not null default clock_timestamp()
);
create index on public.operacion_cambios(org_id, created_at desc);

create function public.registrar_cambio_operacion() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid := coalesce(new.org_id, old.org_id);
begin
  if exists(select 1 from public.organizations where id = o) then
    insert into public.operacion_revision(org_id) values(o)
      on conflict(org_id) do update set revision = gen_random_uuid();
    insert into public.operacion_cambios(org_id, tabla, accion, registro_id)
      values(o, tg_table_name, tg_op, coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', o::text));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger revision_asistencia after insert or update or delete on public.asistencia for each row execute function public.registrar_cambio_operacion();
create trigger revision_ausencias after insert or update or delete on public.ausencias for each row execute function public.registrar_cambio_operacion();
create trigger revision_horarios after insert or update or delete on public.horarios_empleado for each row execute function public.registrar_cambio_operacion();
create trigger revision_empleados after insert or update or delete on public.empleados for each row execute function public.registrar_cambio_operacion();
create trigger revision_settings after insert or update or delete on public.org_settings for each row execute function public.registrar_cambio_operacion();

create table public.liquidacion_cierres (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  desde date not null, hasta date not null check(hasta >= desde),
  revision uuid not null,
  snapshot jsonb not null,
  nota text not null check(length(trim(nota)) between 3 and 1000),
  actor_id uuid not null,
  actor_email text,
  created_at timestamptz not null default now(),
  unique(org_id, desde, hasta, revision)
);
create index on public.liquidacion_cierres(org_id, created_at desc);

create function public.guardar_cierre(p_org uuid, p_desde date, p_hasta date, p_revision uuid,
  p_snapshot jsonb, p_nota text, p_actor uuid, p_email text)
returns uuid language plpgsql set search_path = public as $$
declare actual uuid; cierre uuid;
begin
  select revision into actual from public.operacion_revision where org_id = p_org for update;
  if actual is distinct from p_revision then raise exception 'Los datos cambiaron. Actualizá antes de cerrar.' using errcode = '40001'; end if;
  insert into public.liquidacion_cierres(org_id, desde, hasta, revision, snapshot, nota, actor_id, actor_email)
  values(p_org, p_desde, p_hasta, p_revision, p_snapshot, p_nota, p_actor, p_email)
  returning id into cierre;
  return cierre;
end $$;

-- No hay acceso directo desde cliente, ni siquiera para agentes de la organización.
alter table public.ausencias_historial enable row level security;
alter table public.operacion_revision enable row level security;
alter table public.operacion_cambios enable row level security;
alter table public.liquidacion_cierres enable row level security;
revoke all on public.ausencias_historial, public.operacion_revision, public.operacion_cambios, public.liquidacion_cierres from anon, authenticated;
revoke all on function public.decidir_ausencia(uuid,uuid,integer,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.guardar_cierre(uuid,date,date,uuid,jsonb,text,uuid,text) from public, anon, authenticated;
grant execute on function public.decidir_ausencia(uuid,uuid,integer,text,text,uuid,text) to service_role;
grant execute on function public.guardar_cierre(uuid,date,date,uuid,jsonb,text,uuid,text) to service_role;
grant all on public.ausencias_historial, public.operacion_revision, public.operacion_cambios, public.liquidacion_cierres to service_role;
-- Cierres inmutables también desde el rol usado por la API.
revoke update, delete on public.liquidacion_cierres from service_role;

commit;
