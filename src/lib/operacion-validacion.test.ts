import { describe, it, expect } from "vitest";
import { rangoSchema, decisionSchema, cierreSchema } from "./operacion-validacion.js";
describe("Validación de operación", () => {
  it.each([
    { desde: "2026-02-30", hasta: "2026-03-01" },
    { desde: "2026-09-02", hasta: "2026-09-01" },
    { desde: "2020-01-01", hasta: "2026-09-01" },
    { desde: "", hasta: "2026-09-01" },
  ])("rechaza rango inválido %j", (input) => expect(rangoSchema.safeParse(input).success).toBe(false));
  it("acepta un año bisiesto", () => expect(rangoSchema.safeParse({ desde: "2024-01-01", hasta: "2024-12-31" }).success).toBe(true));
  it("requiere comentario y revisión", () => {
    expect(decisionSchema.safeParse({ estado: "aprobada", revision: 1, comentario: " " }).success).toBe(false);
    expect(decisionSchema.safeParse({ estado: "rechazada", revision: 0, comentario: "Verificado" }).success).toBe(false);
    expect(decisionSchema.safeParse({ estado: "pendiente", revision: 1, comentario: "Verificado" }).success).toBe(false);
  });
  it("rechaza cierres sin token de revisión", () => expect(cierreSchema.safeParse({ desde: "2026-08-01", hasta: "2026-08-31", nota: "Revisado" }).success).toBe(false));
});
