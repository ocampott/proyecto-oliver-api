# Convenciones de este repo

## Tests obligatorios en lógica nueva o modificada

Este repo usa `vitest` (`npm test`). Toda función que haga una cuenta o tome
una decisión de negocio (cálculo de horas, geocerca, verificación de OTP,
cumplimiento de horarios, reglas de convenio cuando existan, etc.) tiene que
tener su test — no es opcional, y no se agrega "después".

**Patrón obligatorio: separar la lógica pura del fetch a Supabase.**
Las funciones en `src/lib/*.ts` que llaman `createServiceClient()` importan
(indirectamente) `env.ts`, que explota si no hay variables de entorno de
Supabase seteadas — eso hace que vitest no pueda ni siquiera cargar el
módulo. La solución es la misma en todos los casos: la lógica de cálculo o
decisión va en un archivo aparte sin ningún import que toque DB/env, y el
archivo con la función original solo hace fetch + delega. Ejemplos ya
hechos, úsalos como referencia antes de inventar un patrón nuevo:

- `src/lib/horas-calculo.ts` — emparejar entrada/salida (`emparejarTurnos`),
  resumen por empleado y el margen de fetch (`ventanaConMargen`). Usado por
  `src/lib/asistencia.ts` (`calcularHoras`).
- `src/lib/otp-logica.ts` — decisión de si un código OTP es válido
  (`evaluarOtp`). Usado por `src/lib/otp.ts` (`verificarOtp`), que aplica los
  efectos (sumar intento, marcar usado) según el resultado.
- `src/lib/cumplimiento-calculo.ts` — matcheo de turno real contra horario
  esperado (`calcularCumplimientoPuro`). Usado por `src/lib/turnos.ts`
  (`calcularCumplimiento`).

El test va al lado del archivo puro: `nombre-modulo.test.ts`.

## Validación de body obligatoria en endpoints nuevos

Nada de `req.body as AlgunTipo` sin pasar antes por un schema de `zod`. El
patrón:

1. Definir el schema en `src/routes/<recurso>.schemas.ts` (ver
   `marcar.schemas.ts` y `sucursales.schemas.ts`).
2. Testear el schema directo (`safeParse` con casos válidos e inválidos) en
   `<recurso>.schemas.test.ts` — es lógica pura, no hace falta mockear nada.
3. Aplicar `validateBody(schema)` (de `src/lib/validation.ts`) como
   middleware de la ruta, antes del handler.

Poné límites reales en los números (lat/lon en rango válido, radios de
geocerca con un tope razonable, etc.) — no alcanza con "es un number", `NaN`
pasa esa validación si no se acota.

El body de Express ya está limitado a 100kb (`src/index.ts`) — no hace falta
tocar eso de nuevo salvo que un endpoint legítimamente necesite más.

## Al implementar cualquier ticket nuevo

Si el ticket toca una función de `src/lib/` o agrega/cambia un endpoint,
sumá el test y la validación como parte del mismo cambio, siguiendo los
patrones de arriba — no como un follow-up separado.
