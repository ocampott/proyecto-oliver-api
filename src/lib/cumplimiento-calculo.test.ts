import { describe, expect, it } from "vitest";
import { calcularCumplimientoPuro, type HorarioParaMatch } from "./cumplimiento-calculo.js";
import type { Turno } from "./horas-calculo.js";

function turno(entrada_at: string, salida_at: string | null, extra: Partial<Turno> = {}): Turno {
  return {
    empleado_id: "e1",
    nombre: "Juan Pérez",
    sucursal_id: "s1",
    sucursal_nombre: "Centro",
    entrada_at,
    salida_at,
    horas: salida_at ? (new Date(salida_at).getTime() - new Date(entrada_at).getTime()) / 3600000 : null,
    ...extra,
  };
}

// entrada_at en UTC = hora AR + 3hs. 12:00 AR lunes == 15:00 UTC lunes.
describe("calcularCumplimientoPuro", () => {
  const horarioLunesAM: HorarioParaMatch = {
    empleado_id: "e1",
    dia_semana: 1, // lunes
    hora_inicio: "09:00",
    hora_fin: "17:00",
    tolerancia_min: null,
  };

  it("marca a_horario cuando entra dentro de la tolerancia", () => {
    const [row] = calcularCumplimientoPuro(
      [turno("2026-08-10T12:03:00.000Z", "2026-08-10T20:00:00.000Z")], // lunes 09:03 AR
      [horarioLunesAM],
      5
    );
    expect(row.estado).toBe("a_horario");
  });

  it("marca tarde cuando entra fuera de la tolerancia", () => {
    const [row] = calcularCumplimientoPuro(
      [turno("2026-08-10T12:20:00.000Z", "2026-08-10T20:00:00.000Z")], // lunes 09:20 AR
      [horarioLunesAM],
      5
    );
    expect(row.estado).toBe("tarde");
    expect(row.diff_entrada_min).toBe(20);
  });

  it("sin_horario cuando no hay franja asignada ese día", () => {
    const [row] = calcularCumplimientoPuro(
      [turno("2026-08-10T12:00:00.000Z", "2026-08-10T20:00:00.000Z")],
      [{ ...horarioLunesAM, dia_semana: 2 }], // martes, no lunes
      5
    );
    expect(row.estado).toBe("sin_horario");
    expect(row.entrada_esperada).toBeNull();
  });

  it("matchea un turno nocturno contra el horario del día anterior", () => {
    // Horario nocturno: domingo 22:00 → lunes 06:00 (dia_semana del turno = domingo = 0)
    const horarioNocturno: HorarioParaMatch = {
      empleado_id: "e1",
      dia_semana: 0, // domingo
      hora_inicio: "22:00",
      hora_fin: "06:00",
      tolerancia_min: null,
    };
    // Entrada real: lunes 01:00 AR = lunes 04:00 UTC (domingo a la noche entrando tarde a la madrugada del lunes)
    const [row] = calcularCumplimientoPuro(
      [turno("2026-08-10T04:00:00.000Z", null)], // lunes 01:00 AR, 2026-08-10 es lunes
      [horarioNocturno],
      5
    );
    expect(row.entrada_esperada).toBe("22:00");
    expect(row.estado).not.toBe("sin_horario");
  });

  it("filtra por empleadoId cuando se pasa", () => {
    const rows = calcularCumplimientoPuro(
      [
        turno("2026-08-10T12:00:00.000Z", "2026-08-10T20:00:00.000Z", { empleado_id: "e1" }),
        turno("2026-08-10T12:00:00.000Z", "2026-08-10T20:00:00.000Z", { empleado_id: "e2", nombre: "Ana" }),
      ],
      [horarioLunesAM, { ...horarioLunesAM, empleado_id: "e2" }],
      5,
      "e2"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].empleado_id).toBe("e2");
  });
});
