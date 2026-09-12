import { describe, expect, it } from "vitest";
import { calcularAusenciasPuro } from "./ausencias-calculo.js";
import type { CumplimientoRow, HorarioParaMatch } from "./cumplimiento-calculo.js";

function horario(extra: Partial<HorarioParaMatch & { id: string }> = {}): HorarioParaMatch & { id: string } {
  return {
    id: "h1",
    empleado_id: "e1",
    dia_semana: 1, // lunes
    hora_inicio: "09:00",
    hora_fin: "17:00",
    tolerancia_min: null,
    ...extra,
  };
}

function cumplimiento(extra: Partial<CumplimientoRow> = {}): CumplimientoRow {
  return {
    empleado_id: "e1",
    nombre: "Juan Pérez",
    sucursal_nombre: "Centro",
    fecha: "2026-08-10", // lunes
    entrada_real: "2026-08-10T12:00:00.000Z",
    entrada_id: "entrada-1",
    entrada_esperada: "09:00",
    diff_entrada_min: 0,
    salida_real: "2026-08-10T20:00:00.000Z",
    salida_id: "salida-1",
    salida_esperada: "17:00",
    diff_salida_min: 0,
    en_curso: false,
    estado: "a_horario",
    tolerancia_aplicada: 5,
    horario_id: "h1",
    ...extra,
  };
}

// "Ahora" bien lejos en el futuro respecto al rango de prueba, así el rango
// completo ya "pasó" y no se descarta ningún día por ser "hoy sin arrancar".
const AHORA_LEJOS = "2026-12-31T23:00:00.000Z";

describe("calcularAusenciasPuro", () => {
  it("marca ausencia cuando el horario pactado no tiene ningún turno que lo cubra", () => {
    const rows = calcularAusenciasPuro(
      { desde: "2026-08-10", hasta: "2026-08-10" },
      [horario()],
      [], // sin cumplimiento — nada cubrió el horario
      new Map(),
      AHORA_LEJOS
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ empleado_id: "e1", fecha: "2026-08-10", justificada: false });
  });

  it("no marca ausencia cuando un turno cubrió el horario_id ese día", () => {
    const rows = calcularAusenciasPuro(
      { desde: "2026-08-10", hasta: "2026-08-10" },
      [horario()],
      [cumplimiento()],
      new Map(),
      AHORA_LEJOS
    );
    expect(rows).toHaveLength(0);
  });

  it("marca justificada cuando la fecha cae dentro de un rango de ausencia cargado", () => {
    const rangos = new Map([["e1", [{ fecha_desde: "2026-08-08", fecha_hasta: "2026-08-12" }]]]);
    const rows = calcularAusenciasPuro({ desde: "2026-08-10", hasta: "2026-08-10" }, [horario()], [], rangos, AHORA_LEJOS);
    expect(rows).toHaveLength(1);
    expect(rows[0].justificada).toBe(true);
  });

  it("no cuenta como ausencia un turno de hoy que todavía no arrancó", () => {
    // "Ahora" es lunes 2026-08-10 08:00 AR (11:00 UTC) — el horario empieza a
    // las 09:00 AR, todavía no llegó la hora.
    const rows = calcularAusenciasPuro(
      { desde: "2026-08-10", hasta: "2026-08-10" },
      [horario()],
      [],
      new Map(),
      "2026-08-10T11:00:00.000Z"
    );
    expect(rows).toHaveLength(0);
  });

  it("no genera ausencia para un día de semana sin horario pactado", () => {
    const rows = calcularAusenciasPuro(
      { desde: "2026-08-11", hasta: "2026-08-11" }, // martes
      [horario()], // pactado lunes
      [],
      new Map(),
      AHORA_LEJOS
    );
    expect(rows).toHaveLength(0);
  });

  it("turno puntual: marca ausencia en su fecha exacta aunque dia_semana no coincida", () => {
    const puntual = horario({ id: "p1", fecha: "2026-08-12", dia_semana: 1 }); // miércoles, dia_semana "mal" a propósito
    const rows = calcularAusenciasPuro(
      { desde: "2026-08-12", hasta: "2026-08-12" },
      [puntual],
      [],
      new Map(),
      AHORA_LEJOS
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fecha).toBe("2026-08-12");
  });

  it("turno puntual: no genera ausencia fuera de su fecha exacta", () => {
    const puntual = horario({ id: "p1", fecha: "2026-08-12", dia_semana: 3 }); // miércoles
    const rows = calcularAusenciasPuro(
      { desde: "2026-08-10", hasta: "2026-08-10" }, // lunes: mismo dia_semana (3->miércoles no es lunes, igual probamos otra fecha)
      [puntual],
      [],
      new Map(),
      AHORA_LEJOS
    );
    expect(rows).toHaveLength(0);
  });

  it("turno puntual: no marca ausencia si un turno lo cubrió (por su id negativo/propio)", () => {
    const puntual = horario({ id: "p1", fecha: "2026-08-12", dia_semana: 3 });
    const cubierto = cumplimiento({ fecha: "2026-08-12", horario_id: "p1" });
    const rows = calcularAusenciasPuro(
      { desde: "2026-08-12", hasta: "2026-08-12" },
      [puntual],
      [cubierto],
      new Map(),
      AHORA_LEJOS
    );
    expect(rows).toHaveLength(0);
  });
});
