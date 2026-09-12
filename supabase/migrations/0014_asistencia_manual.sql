-- Permite cargar/editar marcas de asistencia a mano (ej. el empleado se
-- olvidó de marcar). `origen` distingue si la marca vino del flujo público
-- de /marcar (geocerca real) o la cargó un admin a mano — se fija al crear
-- la fila y no cambia si después se edita.
alter table asistencia
  add column origen text not null default 'empleado' check (origen in ('empleado', 'manual'));

-- Las marcas manuales no tienen geolocalización real.
alter table asistencia alter column lat drop not null;
alter table asistencia alter column lon drop not null;
