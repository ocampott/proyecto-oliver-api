import { beforeEach, it, expect, vi } from "vitest";
vi.mock("./empleados.js", () => ({ listEmpleados: vi.fn(), nombreCompleto: (e: { nombre: string }) => e.nombre }));
vi.mock("./asistencia.js", () => ({ calcularHoras: vi.fn() }));
vi.mock("./turnos.js", () => ({ getTolerancia: vi.fn(), listHorarios: vi.fn() }));
vi.mock("./rrhh.js", () => ({ listAusencias: vi.fn() }));
import { listEmpleados } from "./empleados.js";
import { calcularHoras } from "./asistencia.js";
import { listHorarios, getTolerancia } from "./turnos.js";
import { listAusencias } from "./rrhh.js";
import { calcularLiquidacion } from "./liquidacion.js";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listEmpleados).mockResolvedValue([{ id: "e1", nombre: "Ana", estado: "activo", tipo_pago: "mensual", sueldo_mensual: 800, valor_hora: null, valor_dia: null }] as never);
  vi.mocked(getTolerancia).mockResolvedValue(5);
  vi.mocked(listHorarios).mockResolvedValue([{ id: "h1", empleado_id: "e1", dia_semana: 1, hora_inicio: "09:00", hora_fin: "17:00", tolerancia_min: null }] as never);
  vi.mocked(listAusencias).mockResolvedValue([] as never);
});
it("lee cada fuente una vez y no infiere ausencia de un horario cubierto", async () => {
  vi.mocked(calcularHoras).mockResolvedValue([{ empleado_id: "e1", nombre: "Ana", sucursal_id: "s1", sucursal_nombre: "Centro", entrada_at: "2026-08-10T12:00:00.000Z", salida_at: "2026-08-10T20:00:00.000Z", horas: 8 }]);
  const [fila] = await calcularLiquidacion("org", { desde: "2026-08-10", hasta: "2026-08-10" });
  expect(fila.dias_ausencia).toBe(0);
  expect(fila.descuento_ausencia).toBe(0);
  for (const source of [listEmpleados, calcularHoras, listHorarios, getTolerancia, listAusencias]) expect(source).toHaveBeenCalledTimes(1);
  expect(listEmpleados).toHaveBeenCalledWith("org", false);
});
it.each(["pendiente", "rechazada", "aprobada"])("solo justifica solicitudes aprobadas (%s)", async (estado) => {
  vi.mocked(calcularHoras).mockResolvedValue([]);
  vi.mocked(listAusencias).mockResolvedValue([{ empleado_id: "e1", fecha_desde: "2026-08-10", fecha_hasta: "2026-08-10", estado }] as never);
  const [fila] = await calcularLiquidacion("org", { desde: "2026-08-10", hasta: "2026-08-10" });
  expect(fila.dias_ausencia_justificada).toBe(estado === "aprobada" ? 1 : 0);
});
