# Activación de operación RRHH

Rama coordinada con frontend: `codex/operacion-rrhh`.

**Migración remota pendiente:** aplicar `supabase/migrations/0013_operacion_rrhh.sql` después de 0012, en ventana coordinada con actualización de API y frontend. No activar solo frontend.

Incluye:
- Estados de ausencias, revisión optimista y auditoría atómica.
- Token de revisión por organización y snapshots de cierre inmutables.
- Documentos de legajo compartidos explícitamente con empleado.
- Endpoints administrativos bajo sesión, organización, módulo RRHH y rol owner/admin.
- Portal bajo dispositivo activo/vinculado, organización de la URL coincidente y plan RRHH. Nunca acepta empleadoId para elegir identidad.
- GET /api/admin/metricas bajo superadmin, estadísticas acotadas por proceso.

## Pruebas
`npm ci && npm run build && npm run typecheck && npm test`.

Prueba SQL ejecuta migraciones reales 0001–0013 en PGlite temporal. Auth y Storage son fixtures; CREATE EXTENSION pgcrypto se omite porque gen_random_uuid está en core. Sin Docker ni llamadas a la base remota. Vitest incluye solo src para no duplicar tests compilados.

## Semántica de la migración
Las ausencias existentes se conservan aprobadas. Solo las nuevas del chat quedan pendientes. Las aprobadas justifican y consumen saldo; pendientes/rechazadas no.
Editar datos sustantivos de una ausencia requiere nueva revisión.
Los cierres son snapshots, no bloqueos. Una revisión concurrente invalida el intento de cierre; cambios posteriores no alteran el snapshot.
Historial de decisiones registra usuario y comentario; el registro global de cambios conserva fuente/ID/fecha (no auditoría completa de campos de cada módulo).

## Seguridad
Tablas nuevas privadas con RLS y sin permisos anon/authenticated. RPCs de decisión y cierre solo service_role; la API obtiene actor y organización de la sesión.
Los archivos manuales nacen ocultos para el empleado. El portal solo descarga archivos del propio empleado con visible_empleado=true, como attachment con nosniff.

## Reversión
Preferir forward fix. No borrar tablas ni reconstruir cierres. Un rollback de API a la versión anterior pierde semántica de aprobaciones, por lo que no debe dejarse operativo con escrituras sin una decisión explícita de migración.

## Avisos conocidos
Quedan dos avisos moderate de npm audit heredados de uuid/exceljs. La corrección automática propuesta exige downgrade breaking de ExcelJS y no se aplicó. qs se actualizó con npm audit fix no-breaking.
