import { describe, expect, it } from "vitest";
import { identificarSchema, registrarSchema, verificarSchema } from "./marcar.schemas.js";

describe("registrarSchema", () => {
  const base = { sucursalId: "suc-1", tipo: "entrada", lat: -34.6, lon: -58.4 };

  it("acepta un body válido", () => {
    expect(registrarSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza lat: NaN", () => {
    const r = registrarSchema.safeParse({ ...base, lat: NaN });
    expect(r.success).toBe(false);
  });

  it("rechaza lat fuera de rango (-90..90)", () => {
    expect(registrarSchema.safeParse({ ...base, lat: 200 }).success).toBe(false);
  });

  it("rechaza lon fuera de rango (-180..180)", () => {
    expect(registrarSchema.safeParse({ ...base, lon: -500 }).success).toBe(false);
  });

  it("rechaza un tipo que no sea entrada/salida", () => {
    expect(registrarSchema.safeParse({ ...base, tipo: "almuerzo" }).success).toBe(false);
  });

  it("rechaza si falta sucursalId", () => {
    const { sucursalId: _sucursalId, ...sinSucursal } = base;
    expect(registrarSchema.safeParse(sinSucursal).success).toBe(false);
  });
});

describe("identificarSchema", () => {
  it("acepta un body válido y le hace trim al nombre", () => {
    const r = identificarSchema.safeParse({ orgSlug: "acme", sucursalId: "s1", nombre: "  Juan Pérez  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nombre).toBe("Juan Pérez");
  });

  it("rechaza nombre vacío", () => {
    expect(identificarSchema.safeParse({ orgSlug: "acme", sucursalId: "s1", nombre: "   " }).success).toBe(false);
  });
});

describe("verificarSchema", () => {
  it("acepta un body válido", () => {
    expect(verificarSchema.safeParse({ empleadoId: "e1", code: "123456" }).success).toBe(true);
  });

  it("rechaza code vacío", () => {
    expect(verificarSchema.safeParse({ empleadoId: "e1", code: "" }).success).toBe(false);
  });
});
