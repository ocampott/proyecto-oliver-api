import { describe, expect, it } from "vitest";
import { validarCuil } from "./cuil.js";

describe("validarCuil", () => {
  it("acepta un CUIL con dígito verificador correcto", () => {
    expect(validarCuil("20123456786")).toBe(true);
  });

  it("acepta el mismo CUIL con guiones", () => {
    expect(validarCuil("20-12345678-6")).toBe(true);
  });

  it("rechaza un CUIL con el dígito verificador incorrecto", () => {
    expect(validarCuil("20123456780")).toBe(false);
  });

  it("rechaza algo que no tiene 11 dígitos", () => {
    expect(validarCuil("2012345678")).toBe(false);
  });

  it("rechaza texto sin dígitos", () => {
    expect(validarCuil("no-es-un-cuil")).toBe(false);
  });
});
