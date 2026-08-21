# proyecto-oliver-api

Backend de Proyecto Oliver — Node + Express + TypeScript, conectado a Supabase remoto (sin stack local/Docker).

Es el backend que antes vivía en `proyecto-oliver/server` (Fastify). Se migró a un repo propio y a Express manteniendo el mismo contrato de API para no romper el frontend, que vive en el repo hermano [`proyecto-oliver`](https://github.com/ocampott/proyecto-oliver) (carpeta `web/`).

## Requisitos

- Node.js >= 20
- Un proyecto Supabase remoto ya creado, con las migraciones de `supabase/migrations/` aplicadas.
- No hace falta Docker ni Supabase local — todo corre contra el proyecto remoto compartido.

## Setup

```bash
npm install
cp .env.example .env.local
# completar .env.local con las credenciales del proyecto Supabase remoto
# (te las pasa quien te invitó)
npm run dev
```

El server levanta en `http://localhost:3001` por defecto (configurable con `PORT`).

## Variables de entorno (`.env.local`)

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto del servidor (default 3001) |
| `CORS_ORIGIN` | Origen permitido para CORS — tiene que ser exactamente la URL donde corre el frontend Vite (ej. `http://localhost:5173`; si el puerto no coincide, el navegador tira error de CORS) |
| `MARCAR_BASE_URL` | Base URL pública usada para generar los links/QR de marcado |
| `SUPABASE_URL` | URL del proyecto Supabase remoto |
| `SUPABASE_ANON_KEY` | Anon key del proyecto remoto |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key del proyecto remoto (uso solo server-side) |
| `GOOGLE_MAPS_API_KEY` | Key de servidor para Google Places API (New), restringida por IP |
| `NODE_ENV` | `development` / `production` |

## Correr todo en dev (con el frontend)

Este repo y el frontend (`proyecto-oliver/web`) se levantan por separado:

```bash
# En proyecto-oliver-api/
npm run dev

# En proyecto-oliver/web/
npm run dev
```

El frontend apunta a este backend vía `VITE_API_URL` en su `.env.local` (default `http://localhost:3001`) — tiene que matchear el `PORT` de acá, y el `CORS_ORIGIN` de acá tiene que matchear el puerto donde corre Vite.

## Cuentas de prueba

La base remota compartida tiene 4 cuentas listas para probar cada nivel de plan, contraseña `demo123456` para todas:

| Email | Plan |
| --- | --- |
| `gratis@test.local` | Gratis |
| `basico@test.local` | Básico |
| `pro@test.local` | Pro |
| `superadmin@test.local` | Superadmin (platform admin, sin límites de plan) |

Se pueden renombrar/resetear con `npm run seed:demo` (crea un usuario `demo@test.local`/`demo123456` nuevo con org, sucursal y empleado de prueba) o editando manualmente en `auth.users` vía el Admin API de Supabase.

## Scripts

- `npm run dev` — levanta el server con hot reload (`tsx watch`)
- `npm run build` — compila a `dist/`
- `npm run start` — corre el build compilado
- `npm run typecheck` — `tsc --noEmit`
- `npm run seed:demo` — crea datos demo (usuario, org, sucursal, empleado) en el Supabase remoto conectado

## Migraciones

Las migraciones SQL están en `supabase/migrations/`. Se aplican contra el proyecto remoto linkeado con la Supabase CLI:

```bash
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push
```

No hay stack local de Supabase (sin `config.toml` ni Docker) — todo corre contra el proyecto remoto.

## Estructura

```
src/
  index.ts          # entrypoint Express (middlewares globales, montaje de routers)
  env.ts             # validación de variables de entorno
  middleware/         # requireAuth, requireOrg, requireModulo, requirePlatformAdmin
  routes/             # un router por dominio (empleados, sucursales, asistencia, etc.)
  lib/                # lógica de negocio framework-agnostic (Supabase queries, Excel, etc.)
supabase/
  migrations/         # migraciones SQL del schema
scripts/
  seed-demo.js        # seed de datos demo
```
