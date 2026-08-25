import { describe, expect, it } from "vitest";
import { evaluarOtp } from "./otp-logica.js";

const AHORA = new Date("2026-08-10T12:00:00.000Z");
const VIGENTE = { code: "123456", intentos: 0, expires_at: "2026-08-10T12:10:00.000Z" };

describe("evaluarOtp", () => {
  it("acepta el código correcto dentro de la vigencia", () => {
    expect(evaluarOtp(VIGENTE, "123456", AHORA)).toEqual({ ok: true });
  });

  it("ignora espacios alrededor del código ingresado", () => {
    expect(evaluarOtp(VIGENTE, "  123456  ", AHORA)).toEqual({ ok: true });
  });

  it("rechaza un código incorrecto", () => {
    expect(evaluarOtp(VIGENTE, "000000", AHORA)).toEqual({ ok: false, motivo: "incorrecto" });
  });

  it("rechaza si no hay OTP vigente", () => {
    expect(evaluarOtp(null, "123456", AHORA)).toEqual({ ok: false, motivo: "expirado" });
  });

  it("rechaza si el OTP ya venció", () => {
    const vencido = { ...VIGENTE, expires_at: "2026-08-10T11:59:59.000Z" };
    expect(evaluarOtp(vencido, "123456", AHORA)).toEqual({ ok: false, motivo: "expirado" });
  });

  it("bloquea después de 5 intentos fallidos, incluso con el código correcto", () => {
    const agotado = { ...VIGENTE, intentos: 5 };
    expect(evaluarOtp(agotado, "123456", AHORA)).toEqual({ ok: false, motivo: "bloqueado" });
  });

  it("no bloquea todavía en el intento número 5 (intentos: 4)", () => {
    const casiAgotado = { ...VIGENTE, intentos: 4 };
    expect(evaluarOtp(casiAgotado, "000000", AHORA)).toEqual({ ok: false, motivo: "incorrecto" });
  });
});
