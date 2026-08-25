import { describe, expect, it } from "vitest";
import { crearSucursalSchema, editarSucursalSchema } from "./sucursales.schemas.js";

describe("crearSucursalSchema", () => {
  it("acepta un body válido sin ubicación (se carga después)", () => {
    expect(crearSucursalSchema.safeParse({ nombre: "Sucursal Centro" }).success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    expect(crearSucursalSchema.safeParse({ nombre: "   " }).success).toBe(false);
  });

  it("rechaza un radio absurdo que en la práctica apaga la geocerca", () => {
    expect(crearSucursalSchema.safeParse({ nombre: "X", radio_metros: 999999999 }).success).toBe(false);
  });

  it("rechaza un radio negativo o cero", () => {
    expect(crearSucursalSchema.safeParse({ nombre: "X", radio_metros: 0 }).success).toBe(false);
  });

  it("acepta un radio razonable", () => {
    expect(crearSucursalSchema.safeParse({ nombre: "X", radio_metros: 150 }).success).toBe(true);
  });
});

describe("editarSucursalSchema", () => {
  it("acepta un patch parcial", () => {
    expect(editarSucursalSchema.safeParse({ activa: false }).success).toBe(true);
  });

  it("rechaza radio_metros fuera de rango también al editar", () => {
    expect(editarSucursalSchema.safeParse({ radio_metros: 999999999 }).success).toBe(false);
  });
});
