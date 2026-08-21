import type { User } from "@supabase/supabase-js";
import type { Organization } from "./lib/org.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      org?: Organization;
    }
  }
}

export {};
