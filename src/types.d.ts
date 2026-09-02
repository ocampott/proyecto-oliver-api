import type { AuthUser } from "./lib/jwt.js";
import type { Organization } from "./lib/org.js";
import type { Empleado } from "./lib/empleados.js";

declare global {
  namespace Express {
    interface Request {
      /**
       * Empleado identificado por la cookie de dispositivo (oliver_device),
       * seteado por requireDeviceEmpleado — flujo público sin login (chat
       * de RRHH, igual que /marcar).
       */
      empleado?: Empleado;
      /**
       * Resuelto localmente (ver lib/jwt.ts) a partir de los claims del
       * JWT, no del objeto completo de Supabase Auth — solo trae lo que
       * ya usa la API (id, email).
       */
      user?: AuthUser;
      org?: Organization;
      /**
       * Cache por-request de isPlatformAdmin (ver lib/admin.ts) — evita
       * repetir la consulta a platform_admins cuando varios middlewares
       * (requireModulo, requireRole) o el handler la necesitan en el
       * mismo request.
       */
      isPlatformAdmin?: boolean;
    }
  }
}

export {};
