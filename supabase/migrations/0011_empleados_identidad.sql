-- Paso 1 del módulo de empleados
-- (docs/superpowers/specs/2026-08-25-modulo-empleados-paso1-design.md):
-- identidad (apellido, CUIL), sucursal de base, fecha de ingreso, y
-- estados en vez del booleano activo.

alter table empleados
  add column apellido text,
  add column cuil text,
  add column fecha_ingreso date,
  add column sucursal_id uuid references sucursales (id) on delete set null,
  add column estado text not null default 'activo'
    check (estado in ('activo', 'de_licencia', 'suspendido', 'baja'));

-- Único por org entre los valores cargados — permite CUIL nulo mientras
-- se completa la nómina existente. Se chequea contra TODOS los estados
-- (incluso 'baja') para detectar reingresos con el mismo CUIL.
create unique index empleados_cuil_key on empleados (org_id, cuil) where cuil is not null;

-- Backfill: activo=true → 'activo', activo=false → 'baja' (el mapeo más
-- cercano al significado que tenía activo=false hasta ahora). La columna
-- activo NO se dropea acá — ver 0012, se aplica después de verificar.
update empleados set estado = case when activo then 'activo' else 'baja' end;

-- RPCs de 0008_limites_atomic.sql: pasan de "activo boolean" a "estado".
-- "estado != 'baja'" es lo que ahora cuenta contra el tope del plan — de
-- licencia y suspendido siguen ocupando un lugar (siguen siendo personal).
create or replace function crear_empleado_con_limite(
  p_org_id uuid,
  p_nombre text,
  p_celular text,
  p_max int,
  p_apellido text default null,
  p_cuil text default null,
  p_fecha_ingreso date default null,
  p_sucursal_id uuid default null
)
returns empleados
language plpgsql
as $$
declare
  v_count int;
  v_row empleados;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 0));

  if p_max is not null then
    select count(*) into v_count from empleados where org_id = p_org_id and estado != 'baja';
    if v_count >= p_max then
      raise exception 'limite_plan';
    end if;
  end if;

  insert into empleados (org_id, nombre, celular, apellido, cuil, fecha_ingreso, sucursal_id)
  values (p_org_id, p_nombre, p_celular, p_apellido, p_cuil, p_fecha_ingreso, p_sucursal_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- Generalizada de "reactivar" a "cambiar de estado con chequeo de tope":
-- el chequeo de límite solo corre si el empleado estaba en 'baja' (no
-- contaba) y pasa a un estado que sí cuenta. Entre activo/de_licencia/
-- suspendido, o hacia baja, es un update directo sin chequeo — ya estaba
-- contado, o se está liberando un lugar.
create or replace function reactivar_empleado_con_limite(
  p_org_id uuid,
  p_id uuid,
  p_max int,
  p_nuevo_estado text default 'activo'
)
returns empleados
language plpgsql
as $$
declare
  v_count int;
  v_row empleados;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 0));

  select * into v_row from empleados where org_id = p_org_id and id = p_id;
  if not found then
    raise exception 'empleado_no_encontrado';
  end if;

  if v_row.estado = 'baja' and p_nuevo_estado != 'baja' and p_max is not null then
    select count(*) into v_count from empleados where org_id = p_org_id and estado != 'baja';
    if v_count >= p_max then
      raise exception 'limite_plan';
    end if;
  end if;

  update empleados set estado = p_nuevo_estado where id = p_id returning * into v_row;
  return v_row;
end;
$$;
