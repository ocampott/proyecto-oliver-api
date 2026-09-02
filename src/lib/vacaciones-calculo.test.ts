import { describe, expect, it } from "vitest";
import { calcularSaldoVacacionesPuro } from "./vacaciones-calculo.js";

describe("calcularSaldoVacacionesPuro", () => {
  it("sin fecha de ingreso, devuelve advertencia y saldo null", () => {
    const [row] = calcularSaldoVacacionesPuro(2026, [{ id: "e1", nombre: "Juan", fecha_ingreso: null }], []);
    expect(row.saldo).toBeNull();
    expect(row.advertencia).toBe("Sin fecha de ingreso configurada");
  });

  it("primer año: prorratea 1 día cada 20 trabajados", () => {
    // Ingresó el 2026-01-01 → al 31/12/2026 trabajó 365 días → floor(365/20) = 18.
    const [row] = calcularSaldoVacacionesPuro(2026, [{ id: "e1", nombre: "Juan", fecha_ingreso: "2026-01-01" }], []);
    expect(row.antiguedad_anios).toBe(0);
    expect(row.dias_asignados).toBe(18);
  });

  it("antigüedad justo en 5 años: 21 días (no 14)", () => {
    // Al 31/12/2026, ingresado el 2021-12-31 tiene exactamente 5 años cumplidos.
    const [row] = calcularSaldoVacacionesPuro(2026, [{ id: "e1", nombre: "Juan", fecha_ingreso: "2021-12-31" }], []);
    expect(row.antiguedad_anios).toBe(5);
    expect(row.dias_asignados).toBe(21);
  });

  it("un día menos de 5 años: sigue en el tramo de 14 días", () => {
    const [row] = calcularSaldoVacacionesPuro(2026, [{ id: "e1", nombre: "Juan", fecha_ingreso: "2022-01-01" }], []);
    expect(row.antiguedad_anios).toBe(4);
    expect(row.dias_asignados).toBe(14);
  });

  it("antigüedad justo en 10 y 20 años: 28 y 35 días", () => {
    const [diez] = calcularSaldoVacacionesPuro(2026, [{ id: "e1", nombre: "Juan", fecha_ingreso: "2016-12-31" }], []);
    expect(diez.dias_asignados).toBe(28);
    const [veinte] = calcularSaldoVacacionesPuro(2026, [{ id: "e1", nombre: "Juan", fecha_ingreso: "2006-12-31" }], []);
    expect(veinte.dias_asignados).toBe(35);
  });

  it("descuenta los días de ausencias con motivo vacaciones dentro del año, recortados al año", () => {
    const [row] = calcularSaldoVacacionesPuro(
      2026,
      [{ id: "e1", nombre: "Juan", fecha_ingreso: "2020-01-01" }],
      [{ empleado_id: "e1", fecha_desde: "2026-01-05", fecha_hasta: "2026-01-14" }] // 10 días
    );
    expect(row.dias_usados).toBe(10);
    expect(row.saldo).toBe(row.dias_asignados! - 10);
  });

  it("empleado que ingresa después del año objetivo: 0 días asignados", () => {
    const [row] = calcularSaldoVacacionesPuro(2026, [{ id: "e1", nombre: "Juan", fecha_ingreso: "2027-01-01" }], []);
    expect(row.dias_asignados).toBe(0);
    expect(row.antiguedad_anios).toBe(0);
  });
});
