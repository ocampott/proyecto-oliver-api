import { listEmpleados, nombreCompleto } from "./empleados.js";
import { listAusencias } from "./rrhh.js";
import {
  calcularSaldoVacacionesPuro,
  type SaldoVacacionesEmpleado,
  type EmpleadoParaVacaciones,
} from "./vacaciones-calculo.js";

export type { SaldoVacacionesEmpleado };

const ESTADOS_OPERATIVOS = ["activo", "de_licencia"];

export async function calcularSaldoVacaciones(orgId: string, anio?: number): Promise<SaldoVacacionesEmpleado[]> {
  const anioObjetivo = anio ?? new Date().getUTCFullYear();
  const inicioAnio = `${anioObjetivo}-01-01`;
  const finAnio = `${anioObjetivo}-12-31`;

  const [empleadosTodos, ausencias] = await Promise.all([
    listEmpleados(orgId),
    listAusencias(orgId, { desde: inicioAnio, hasta: finAnio }),
  ]);

  const empleados: EmpleadoParaVacaciones[] = empleadosTodos
    .filter((e) => ESTADOS_OPERATIVOS.includes(e.estado))
    .map((e) => ({ id: e.id, nombre: nombreCompleto(e), fecha_ingreso: e.fecha_ingreso }));

  const vacacionesRows = ausencias
    .filter((a) => a.motivo.trim().toLowerCase() === "vacaciones")
    .map((a) => ({ empleado_id: a.empleado_id, fecha_desde: a.fecha_desde, fecha_hasta: a.fecha_hasta }));

  return calcularSaldoVacacionesPuro(anioObjetivo, empleados, vacacionesRows);
}
