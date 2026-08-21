-- Postgres no indexa automáticamente las columnas de FK. La API filtra
-- por org_id en absolutamente todas las lecturas (multi-tenant), y varias
-- de esas tablas nunca tuvieron un índice para ese filtro — funcionaba
-- igual con pocos datos de prueba, pero degrada a scan secuencial a
-- medida que crecen. Se agregan los que faltaban, en línea con los que ya
-- existían para asistencia/ausencias/suscripciones (ver 0003/0005/0007).

create index on sucursales (org_id);
create index on empleados (org_id);

-- listRechazadas() filtra exactamente por esta combinación (ver
-- src/lib/asistencia.ts).
create index on asistencia_rechazada (org_id, resuelto);

-- getOtpVigente() se llama una vez por empleado sin device_token al
-- listar empleados (ver src/routes/empleados.ts).
create index on otp_codes (empleado_id);

-- listHorarios() sin empleadoId (vista completa de horarios de la org)
-- filtra solo por org_id; el índice existente (empleado_id, dia_semana)
-- no sirve para ese caso.
create index on horarios_empleado (org_id);
