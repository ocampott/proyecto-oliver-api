import type { User } from "@supabase/supabase-js";
import type { Organization } from "./lib/org.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
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
