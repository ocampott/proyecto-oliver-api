import { randomInt } from "node:crypto";
import { createServiceClient } from "./supabase-service.js";

const OTP_TTL_MINUTOS = 10;
const OTP_MAX_INTENTOS = 5;
export const CANAL_ASISTENCIA_WEB = "asistencia_web";

export interface OtpCode {
  id: string;
  empleado_id: string;
  canal: string;
  code: string;
  intentos: number;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * Genera un código de vinculación de 6 dígitos para el empleado.
 * Invalida los códigos anteriores no usados del mismo empleado/canal.
 * Devuelve el código en texto plano: en v1 lo ve el admin en el dashboard
 * para entregárselo al empleado en persona (cuando exista el canal de
 * WhatsApp, este mismo código se envía por ahí y el flujo no cambia).
 */
export async function generarOtp(orgId: string, empleadoId: string): Promise<string> {
  const service = createServiceClient();

  // Sanity: el empleado tiene que ser de esa org.
  const { data: empleado, error: empErr } = await service
    .from("empleados")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", empleadoId)
    .maybeSingle();
  if (empErr) throw empErr;
  if (!empleado) throw new Error("Empleado no encontrado en la organización");

  // Invalida códigos anteriores no usados del mismo empleado/canal.
  const { error: delErr } = await service
    .from("otp_codes")
    .delete()
    .eq("empleado_id", empleadoId)
    .eq("canal", CANAL_ASISTENCIA_WEB)
    .is("used_at", null);
  if (delErr) throw delErr;

  const code = randomInt(0, 1000000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTOS * 60 * 1000).toISOString();

  const { error } = await service.from("otp_codes").insert({
    empleado_id: empleadoId,
    canal: CANAL_ASISTENCIA_WEB,
    code,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return code;
}

export type VerificarOtpResult =
  | { ok: true }
  | { ok: false; motivo: "incorrecto" | "expirado" | "bloqueado" };

export async function verificarOtp(
  empleadoId: string,
  code: string
): Promise<VerificarOtpResult> {
  const service = createServiceClient();

  const { data: otp, error } = await service
    .from("otp_codes")
    .select("*")
    .eq("empleado_id", empleadoId)
    .eq("canal", CANAL_ASISTENCIA_WEB)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (!otp || new Date(otp.expires_at) < new Date()) {
    return { ok: false, motivo: "expirado" };
  }
  if (otp.intentos >= OTP_MAX_INTENTOS) {
    return { ok: false, motivo: "bloqueado" };
  }
  if (otp.code !== code.trim()) {
    const { error: updErr } = await service
      .from("otp_codes")
      .update({ intentos: otp.intentos + 1 })
      .eq("id", otp.id);
    if (updErr) throw updErr;
    return { ok: false, motivo: "incorrecto" };
  }

  const { error: useErr } = await service
    .from("otp_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", otp.id);
  if (useErr) throw useErr;
  return { ok: true };
}

/** OTP vigente (no usado, no expirado) del empleado, para mostrar al admin. */
export async function getOtpVigente(empleadoId: string): Promise<OtpCode | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("otp_codes")
    .select("*")
    .eq("empleado_id", empleadoId)
    .eq("canal", CANAL_ASISTENCIA_WEB)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
