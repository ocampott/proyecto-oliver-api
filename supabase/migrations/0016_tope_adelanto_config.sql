-- Tope de adelantos configurable por org (antes era fijo: 20% del sueldo
-- mensual). Vive en org_settings, mismo patrón que tolerancia_min (0004).
alter table org_settings
  add column tope_adelanto_tipo text not null default 'porcentaje'
    check (tope_adelanto_tipo in ('porcentaje', 'monto_fijo', 'sin_tope')),
  add column tope_adelanto_valor numeric not null default 20;
