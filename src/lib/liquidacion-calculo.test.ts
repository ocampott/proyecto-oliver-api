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
    entrada_id: "entrada-1",
    salida_at: entrada_at,
    salida_id: "salida-1",
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
        entrada_id: "entrada-1",
        entrada_esperada: "09:00",
        diff_entrada_min: 20,
        salida_real: "2026-08-10T20:00:00.000Z",
        salida_id: "salida-1",
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

  it("descuenta los adelantos del período del total, sea cual sea el tipo de pago", () => {
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: "hora", sueldo_mensual: null, valor_hora: 1000, valor_dia: null };
    const adelantos = [{ empleado_id: "e1", monto: 3000 }];
    const [row] = calcularLiquidacionPuro(FILTERS, [emp], [turno("2026-08-10T12:00:00.000Z", 8)], [], [], [], adelantos);
    expect(row.adelantos).toBe(3000);
    expect(row.total).toBe(8000 - 3000);
  });

  it("suma varios adelantos del mismo empleado en el período", () => {
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: "mensual", sueldo_mensual: 100000, valor_hora: null, valor_dia: null };
    const adelantos = [
      { empleado_id: "e1", monto: 2000 },
      { empleado_id: "e1", monto: 1500 },
    ];
    const [row] = calcularLiquidacionPuro(FILTERS, [emp], [], [], [], [], adelantos);
    expect(row.adelantos).toBe(3500);
    expect(row.total).toBe(100000 - 3500);
  });

  it("tipo mensual: un adelanto no ensucia la comparación contra el pago por hora", () => {
    // Horario lunes a viernes 09-17 (40hs pactadas en el rango) y horas
    // trabajadas exactas — sin adelanto, sueldo_mensual y total_por_horas
    // coinciden, así que no debería haber advertencia de "cobra menos/más".
    const horarios = Array.from({ length: 5 }, (_, i) => ({
      empleado_id: "e1",
      dia_semana: i + 1,
      hora_inicio: "09:00",
      hora_fin: "17:00",
    }));
    const turnos: Turno[] = Array.from({ length: 5 }, (_, i) =>
      turno(`2026-08-1${i}T12:00:00.000Z`, 8, { empleado_id: "e1" })
    );
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: "mensual", sueldo_mensual: 40000, valor_hora: 1000, valor_dia: null };
    const adelantos = [{ empleado_id: "e1", monto: 5000 }];

    const [row] = calcularLiquidacionPuro(FILTERS, [emp], turnos, [], [], horarios, adelantos);
    expect(row.total_por_horas).toBe(40000);
    expect(row.total).toBe(40000 - 5000);
    expect(row.advertencias.some((a) => a.includes("más que si se le pagara") || a.includes("menos que si se le pagara"))).toBe(false);
  });

  it("tipo mensual: un turno puntual (fecha exacta) suma horas pactadas una sola vez", () => {
    // Sin horario recurrente, solo un turno puntual el 2026-08-12 (dentro del rango).
    const horarios = [{ empleado_id: "e1", dia_semana: 3, hora_inicio: "09:00", hora_fin: "13:00", fecha: "2026-08-12" }];
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: "mensual", sueldo_mensual: 4000, valor_hora: 1000, valor_dia: null };
    const [row] = calcularLiquidacionPuro(FILTERS, [emp], [], [], [], horarios);
    expect(row.horas_pactadas).toBe(4); // una sola ocurrencia, no multiplicada por "ocurrencias en el rango"
  });

  it("tipo dia: un turno puntual paga jornal completo ese día en vez de directo por hora", () => {
    const horarios = [{ empleado_id: "e1", dia_semana: 3, hora_inicio: "09:00", hora_fin: "17:00", fecha: "2026-08-12" }]; // 8hs pactadas
    const emp: EmpleadoParaLiquidacion = { id: "e1", nombre: "Juan", tipo_pago: "dia", sueldo_mensual: null, valor_hora: 500, valor_dia: 10000 };
    // Trabaja el 2026-08-12 (miércoles) 9hs (1 extra).
    const [row] = calcularLiquidacionPuro(FILTERS, [emp], [turno("2026-08-12T12:00:00.000Z", 9)], [], [], horarios);
    expect(row.dias_trabajados).toBe(1);
    expect(row.horas_extra).toBe(1);
    expect(row.total).toBe(10000 + 1 * 500);
  });
});
