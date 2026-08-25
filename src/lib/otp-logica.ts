// Decisión pura de verificación de OTP — sin DB, sin env. Separado de otp.ts
// para poder testearlo sin depender de Supabase (spec §2.2/§2.4).

const OTP_MAX_INTENTOS = 5;

export interface OtpVigente {
  code: string;
  intentos: number;
  expires_at: string;
}

export type EvaluarOtpResult =
  | { ok: true }
  | { ok: false; motivo: "incorrecto" | "expirado" | "bloqueado" };

/**
 * Decide si un código ingresado es válido para un OTP dado, sin tocar la
 * base. El caller (otp.ts) es responsable de los efectos: si vuelve
 * "incorrecto" hay que sumar 1 a intentos, si vuelve ok hay que marcar el
 * OTP como usado.
 */
export function evaluarOtp(otp: OtpVigente | null, codeIngresado: string, ahora: Date = new Date()): EvaluarOtpResult {
  if (!otp || new Date(otp.expires_at) < ahora) {
    return { ok: false, motivo: "expirado" };
  }
  if (otp.intentos >= OTP_MAX_INTENTOS) {
    return { ok: false, motivo: "bloqueado" };
  }
  if (otp.code !== codeIngresado.trim()) {
    return { ok: false, motivo: "incorrecto" };
  }
  return { ok: true };
}
