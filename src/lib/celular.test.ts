import { describe, expect, it } from "vitest";
import { normalizarCelular } from "./celular.js";

describe("normalizarCelular", () => {
  it("normaliza un número sin prefijos", () => {
    expect(normalizarCelular("3411234567")).toBe("+54 9 3411234567");
  });

  it("saca el 0 de larga distancia", () => {
    expect(normalizarCelular("03411234567")).toBe("+54 9 3411234567");
  });

  it("normaliza un número con código de país sin el 9 de celular", () => {
    expect(normalizarCelular("+543411234567")).toBe("+54 9 3411234567");
  });

  it("normaliza un número ya completo con +54 9", () => {
    expect(normalizarCelular("+5493411234567")).toBe("+54 9 3411234567");
  });

  it("ignora espacios y guiones", () => {
    expect(normalizarCelular("341-123-4567")).toBe("+54 9 3411234567");
  });

  it("devuelve null si no reconoce el formato", () => {
    expect(normalizarCelular("12345")).toBeNull();
  });
});
