import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../env.js";

export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * El proyecto usa claves de firma asimétricas (ES256) — Supabase recomienda
 * verificar el JWT localmente contra el JWKS público en vez de pegarle por
 * red a auth.getUser() en cada request (ver
 * https://supabase.com/docs/guides/auth/jwts). jose cachea el JWKS y lo
 * refresca solo; la única contra documentada es que revocar una sesión o
 * banear a alguien puede tardar hasta ~10-20 min en reflejarse acá, contra
 * ser instantáneo con la verificación por red — trade-off aceptado por el
 * mismo motivo que lo recomienda Supabase para este tipo de clave.
 */
const JWKS = createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`));

export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${env.supabaseUrl}/auth/v1`,
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string") return null;
    return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
  } catch {
    return null;
  }
}
