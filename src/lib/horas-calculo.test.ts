import { describe, expect, it } from "vitest";
import { calcularResumenHoras, emparejarTurnos, ventanaConMargen, type Turno } from "./horas-calculo.js";

function reg(
  empleado_id: string,
  tipo: "entrada" | "salida",
  created_at: string,
  extra: Partial<{ sucursal_id: string; nombre: string; sucursal_nombre: string }> = {}
) {
  return {
    empleado_id,
    sucursal_id: extra.sucursal_id ?? "suc-1",
    tipo,
    created_at,
    nombre: extra.nombre ?? "Juan Pérez",
    sucursal_nombre: extra.sucursal_nombre ?? "Centro",
  };
}

describe("emparejarTurnos", () => {
  it("empareja una entrada con su salida el mismo día", () => {
    const turnos = emparejarTurnos([
      reg("e1", "entrada", "2026-08-10T12:00:00.000Z"),
      reg("e1", "salida", "2026-08-10T20:00:00.000Z"),
    ]);
    expect(turnos).toHaveLength(1);
    expect(turnos[0].horas).toBe(8);
    expect(turnos[0].salida_at).toBe("2026-08-10T20:00:00.000Z");
  });

  it("turno nocturno que cruza medianoche da 8 horas (22:00→06:00)", () => {
    const turnos = emparejarTurnos([
      reg("e1", "entrada", "2026-08-10T22:00:00.000Z"),
      reg("e1", "salida", "2026-08-11T06:00:00.000Z"),
    ]);
    expect(turnos).toHaveLength(1);
    expect(turnos[0].horas).toBe(8);
  });

  it("una entrada sin salida queda como turno en curso (horas: null)", () => {
    const turnos = emparejarTurnos([reg("e1", "entrada", "2026-08-10T12:00:00.000Z")]);
    expect(turnos).toHaveLength(1);
    expect(turnos[0].horas).toBeNull();
    expect(turnos[0].salida_at).toBeNull();
  });

  it("una salida sin entrada previa se ignora (dato huérfano)", () => {
    const turnos = emparejarTurnos([reg("e1", "salida", "2026-08-10T12:00:00.000Z")]);
    expect(turnos).toHaveLength(0);
  });

  it("dos entradas seguidas: la primera queda abierta y arranca un turno nuevo", () => {
    const turnos = emparejarTurnos([
      reg("e1", "entrada", "2026-08-10T08:00:00.000Z"),
      reg("e1", "entrada", "2026-08-10T09:00:00.000Z"),
      reg("e1", "salida", "2026-08-10T17:00:00.000Z"),
    ]);
    expect(turnos).toHaveLength(2);
    const abierto = turnos.find((t) => t.horas === null)!;
    const cerrado = turnos.find((t) => t.horas !== null)!;
    expect(abierto.entrada_at).toBe("2026-08-10T08:00:00.000Z");
    expect(cerrado.horas).toBe(8);
  });

  it("tope de 16hs: si la próxima salida está más lejos, la entrada queda abierta y la salida se descarta", () => {
    const turnos = emparejarTurnos([
      reg("e1", "entrada", "2026-08-10T08:00:00.000Z"),
      // 20hs después — más allá del tope, típico "me olvidé de marcar la salida"
      reg("e1", "salida", "2026-08-11T04:00:00.000Z"),
    ]);
    expect(turnos).toHaveLength(1);
    expect(turnos[0].horas).toBeNull();
    expect(turnos[0].salida_at).toBeNull();
  });

  it("mantiene turnos separados por empleado y por sucursal", () => {
    const turnos = emparejarTurnos([
      reg("e1", "entrada", "2026-08-10T08:00:00.000Z", { sucursal_id: "suc-1" }),
      reg("e2", "entrada", "2026-08-10T08:00:00.000Z", { sucursal_id: "suc-1", nombre: "Ana Gómez" }),
      reg("e1", "salida", "2026-08-10T16:00:00.000Z", { sucursal_id: "suc-1" }),
      reg("e2", "salida", "2026-08-10T16:00:00.000Z", { sucursal_id: "suc-1", nombre: "Ana Gómez" }),
    ]);
    expect(turnos).toHaveLength(2);
    expect(turnos.every((t) => t.horas === 8)).toBe(true);
  });
});

describe("calcularResumenHoras", () => {
  it("suma las horas cerradas y marca en curso si hay un turno abierto", () => {
    const turnos: Turno[] = [
      {
        empleado_id: "e1",
        nombre: "Juan Pérez",
        sucursal_id: "s1",
        sucursal_nombre: "Centro",
        entrada_at: "2026-08-10T12:00:00.000Z",
        salida_at: "2026-08-10T20:00:00.000Z",
        horas: 8,
      },
      {
        empleado_id: "e1",
        nombre: "Juan Pérez",
        sucursal_id: "s1",
        sucursal_nombre: "Centro",
        entrada_at: "2026-08-11T12:00:00.000Z",
        salida_at: null,
        horas: null,
      },
    ];
    const resumen = calcularResumenHoras(turnos);
    expect(resumen).toHaveLength(1);
    expect(resumen[0].totalHoras).toBe(8);
    expect(resumen[0].enCurso).toBe(true);
  });
});

describe("ventanaConMargen", () => {
  it("amplía el rango pedido 18hs para cada lado", () => {
    const v = ventanaConMargen("2026-08-10", "2026-08-10");
    expect(new Date(v.desdeConMargen).getTime()).toBeLessThan(new Date(v.desdeInicio).getTime());
    expect(new Date(v.hastaConMargen).getTime()).toBeGreaterThan(new Date(v.hastaFin).getTime());
    const margenMs = new Date(v.desdeInicio).getTime() - new Date(v.desdeConMargen).getTime();
    expect(margenMs).toBe(18 * 3600000);
  });
});
