-- Cierra el TOCTOU del finding #8 del code-review: el chequeo de límite del
-- plan (contar activos + insertar/reactivar) se hacía en dos pasos desde la
-- app, sin nada que impida que dos requests concurrentes pasen el chequeo a
-- la vez y superen el tope. Se mueve el conteo + la escritura a funciones de
-- Postgres que toman un advisory lock por organización, así el ciclo
-- lee-decide-escribe queda serializado por org sin bloquear organizaciones
-- distintas entre sí.
--
-- p_max = null significa "sin límite" (plan ilimitado/superadmin) y salta el
-- chequeo directamente, igual que puedeCrearEmpleado/puedeCrearSucursal en
-- lib/planes.ts.

create or replace function crear_empleado_con_limite(
  p_org_id uuid,
  p_nombre text,
  p_celular text,
  p_max int
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
    select count(*) into v_count from empleados where org_id = p_org_id and activo = true;
    if v_count >= p_max then
      raise exception 'limite_plan';
    end if;
  end if;

  insert into empleados (org_id, nombre, celular)
  values (p_org_id, p_nombre, p_celular)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function reactivar_empleado_con_limite(
  p_org_id uuid,
  p_id uuid,
  p_max int
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

  if not v_row.activo and p_max is not null then
    select count(*) into v_count from empleados where org_id = p_org_id and activo = true;
    if v_count >= p_max then
      raise exception 'limite_plan';
    end if;
  end if;

  update empleados set activo = true where id = p_id returning * into v_row;
  return v_row;
end;
$$;

create or replace function crear_sucursal_con_limite(
  p_org_id uuid,
  p_nombre text,
  p_lat double precision,
  p_lon double precision,
  p_radio_metros int,
  p_direccion text,
  p_max int
)
returns sucursales
language plpgsql
as $$
declare
  v_count int;
  v_row sucursales;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 1));

  if p_max is not null then
    select count(*) into v_count from sucursales where org_id = p_org_id and activa = true;
    if v_count >= p_max then
      raise exception 'limite_plan';
    end if;
  end if;

  insert into sucursales (org_id, nombre, lat, lon, radio_metros, direccion)
  values (p_org_id, p_nombre, p_lat, p_lon, coalesce(p_radio_metros, 100), p_direccion)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function reactivar_sucursal_con_limite(
  p_org_id uuid,
  p_id uuid,
  p_max int
)
returns sucursales
language plpgsql
as $$
declare
  v_count int;
  v_row sucursales;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 1));

  select * into v_row from sucursales where org_id = p_org_id and id = p_id;
  if not found then
    raise exception 'sucursal_no_encontrada';
  end if;

  if not v_row.activa and p_max is not null then
    select count(*) into v_count from sucursales where org_id = p_org_id and activa = true;
    if v_count >= p_max then
      raise exception 'limite_plan';
    end if;
  end if;

  update sucursales set activa = true where id = p_id returning * into v_row;
  return v_row;
end;
$$;
