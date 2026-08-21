import { createServiceClient } from "./supabase-service.js";

/**
 * Estructural (no express.Request genérico) para no chocar con las
 * distintas instanciaciones de Request<Params, Body, ...> que usa cada
 * handler — solo necesitamos leer/escribir estos dos campos.
 */
export interface ReqAuthCache {
  user?: { id: string };
  isPlatformAdmin?: boolean;
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * Espejo de isPlatformAdmin() cacheado en req.isPlatformAdmin: dentro de
 * un mismo request suele haber más de un chequeo (requireModulo,
 * requireRole, y a veces el handler la vuelve a necesitar para límites de
 * plan) — sin esto cada uno pega su propia consulta a platform_admins.
 */
export async function checkPlatformAdmin(req: ReqAuthCache): Promise<boolean> {
  if (req.isPlatformAdmin !== undefined) return req.isPlatformAdmin;
  const result = req.user ? await isPlatformAdmin(req.user.id) : false;
  req.isPlatformAdmin = result;
  return result;
}
