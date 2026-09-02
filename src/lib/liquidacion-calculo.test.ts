import { describe, expect, it } from "vitest";
import { calcularLiquidacionPuro, type EmpleadoParaLiquidacion } from "./liquidacion-calculo.js";
import type { Turno } from "./horas-calculo.js";
import type { CumplimientoRow } from "./cumplimiento-calculo.js";

const FILTERS = { desde: "2026-08-10", hasta: "2026-08-14" }; // lunes a viernes

function turno(entrada_at: string, horas: number, extra: Partial<Turno> = {}): Turno {
  return {
    empleado_id: "e1",
    nombre: "Juan Pérez",
    sucursal_id: "s1",
    sucursal_nombre: "Centro",
    entrada_at,
    salida_at: entrada_at,
    horas,
    ...extra,
  };
}

describe("calcularLiquidacionPuro", () => {
  it("tipo hora: cobra horas trabajadas × valor hora", () => {
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: "hora", sueldo_mensual: null, valor_hora: 1000, valor_dia: null };
    const [row] = calcularLiquidacionPuro(FILTERS, [emp], [turno("2026-08-10T12:00:00.000Z", 8)], [], [], []);
    expect(row.total).toBe(8000);
    expect(row.horas_trabajadas).toBe(8);
    expect(row.advertencias).toHaveLength(0);
  });

  it("tipo dia: cobra un jornal por día trabajado que coincide con el horario pactado, más horas extra", () => {
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: "dia", sueldo_mensual: null, valor_hora: 500, valor_dia: 10000 };
    const horarios = [{ empleado_id: "e1", dia_semana: 1, hora_inicio: "09:00", hora_fin: "17:00" }]; // lunes, 8hs pactadas
    // Lunes 2026-08-10, entra 09:00 AR (12:00 UTC), trabaja 9 horas (1 extra).
    const [row] = calcularLiquidacionPuro(FILTERS, [emp], [turno("2026-08-10T12:00:00.000Z", 9)], [], [], horarios);
    expect(row.dias_trabajados).toBe(1);
    expect(row.horas_extra).toBe(1);
    expect(row.total).toBe(10000 + 1 * 500);
  });

  it("tipo mensual: descuenta tardanza y ausencia sin aviso del sueldo fijo", () => {
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: "mensual", sueldo_mensual: 100000, valor_hora: 500, valor_dia: null };
    // Horario lunes a viernes 09-17 (8hs × 5 días = 40hs pactadas en el rango).
    const horarios = Array.from({ length: 5 }, (_, i) => ({
      empleado_id: "e1",
      dia_semana: i + 1,
      hora_inicio: "09:00",
      hora_fin: "17:00",
    }));
    const cumplimiento: CumplimientoRow[] = [
      {
        empleado_id: "e1",
        nombre: "Juan",
        sucursal_nombre: "Centro",
        fecha: "2026-08-10",
        entrada_real: "2026-08-10T12:20:00.000Z",
        entrada_esperada: "09:00",
        diff_entrada_min: 20,
        salida_real: "2026-08-10T20:00:00.000Z",
        salida_esperada: "17:00",
        diff_salida_min: 0,
        en_curso: false,
        estado: "tarde",
        tolerancia_aplicada: 5,
        horario_id: "h1",
      },
    ];
    const ausencias = [{ empleado_id: "e1", fecha: "2026-08-11", hora_inicio: "09:00", hora_fin: "17:00", horas: 8, justificada: false }];
    const [row] = calcularLiquidacionPuro(FILTERS, [emp], [], cumplimiento, ausencias, horarios);
    expect(row.horas_pactadas).toBe(40);
    expect(row.minutos_perdidos).toBe(20);
    expect(row.dias_ausencia).toBe(1);
    expect(row.descuento_tardanza).toBeGreaterThan(0);
    expect(row.descuento_ausencia).toBeGreaterThan(0);
    expect(row.total).toBeLessThan(100000);
  });

  it("sin tipo_pago configurado, agrega advertencia y total 0", () => {
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: null, sueldo_mensual: null, valor_hora: null, valor_dia: null };
    const [row] = calcularLiquidacionPuro(FILTERS, [emp], [], [], [], []);
    expect(row.total).toBe(0);
    expect(row.advertencias).toContain("Sin tipo de pago configurado");
  });
});
