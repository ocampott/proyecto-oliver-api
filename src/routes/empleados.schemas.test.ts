import { describe, expect, it } from "vitest";
import { crearEmpleadoSchema, editarEmpleadoSchema } from "./empleados.schemas.js";

describe("crearEmpleadoSchema", () => {
  const base = { nombre: "Juan", apellido: "Pérez" };

  it("acepta el mínimo requerido", () => {
    expect(crearEmpleadoSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza si falta apellido", () => {
    expect(crearEmpleadoSchema.safeParse({ nombre: "Juan" }).success).toBe(false);
  });

  it("acepta y normaliza un CUIL válido con guiones", () => {
    const r = crearEmpleadoSchema.safeParse({ ...base, cuil: "20-12345678-6" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cuil).toBe("20123456786");
  });

  it("rechaza un CUIL con dígito verificador incorrecto", () => {
    expect(crearEmpleadoSchema.safeParse({ ...base, cuil: "20123456780" }).success).toBe(false);
  });

  it("acepta y normaliza un celular", () => {
    const r = crearEmpleadoSchema.safeParse({ ...base, celular: "03411234567" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.celular).toBe("+54 9 3411234567");
  });

  it("rechaza un celular no reconocible", () => {
    expect(crearEmpleadoSchema.safeParse({ ...base, celular: "12345" }).success).toBe(false);
  });
});

describe("editarEmpleadoSchema", () => {
  it("acepta un patch parcial sin apellido (empleados ya migrados pueden no tenerlo todavía)", () => {
    expect(editarEmpleadoSchema.safeParse({ estado: "de_licencia" }).success).toBe(true);
  });

  it("rechaza un estado que no existe", () => {
    expect(editarEmpleadoSchema.safeParse({ estado: "jubilado" }).success).toBe(false);
  });
});
