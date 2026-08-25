import { Router, type Request, type Response } from "express";
import { getOrgBySlug } from "../lib/org.js";
import { getSucursal } from "../lib/sucursales.js";
import {
  getEmpleadoByToken,
  buscarEnNomina,
  getEmpleadoById,
  vincularDispositivo,
  nombreCompleto,
} from "../lib/empleados.js";
import { getDeviceToken, nuevoDeviceToken, setDeviceCookie } from "../lib/device-token.js";
import { generarOtp, verificarOtp } from "../lib/otp.js";
import { registrarMarca, type TipoMarca, registrarRechazo } from "../lib/asistencia.js";
import { validateBody } from "../lib/validation.js";
import { identificarSchema, registrarSchema, verificarSchema } from "./marcar.schemas.js";

interface EstadoQuery {
  org: string;
  sucursal: string;
}

export const marcarRouter = Router();

marcarRouter.get(
  "/marcar/estado",
  async (req: Request<Record<string, never>, unknown, unknown, EstadoQuery>, res: Response) => {
    const { org: orgSlug, sucursal: sucursalId } = req.query;
    if (!orgSlug || !sucursalId) {
      res.status(400).json({ error: "Faltan datos" });
      return;
    }

    const org = await getOrgBySlug(orgSlug);
    const sucursal = org ? await getSucursal(org.id, sucursalId) : null;
    if (!org || !sucursal || !sucursal.activa) {
      res.status(404).json({
        error: "Este enlace no es válido o la sucursal está desactivada. Pedile el QR correcto a tu encargado.",
      });
      return;
    }

    const token = getDeviceToken(req as unknown as Request);
    const empleado = token ? await getEmpleadoByToken(token) : null;
    const nombre = empleado && empleado.org_id === org.id ? nombreCompleto(empleado) : null;

    res.json({ sucursalNombre: sucursal.nombre, empleadoNombre: nombre });
  }
);

/**
 * Paso 1 del marcado público: identificar al empleado por nombre.
 * - Match exacto/subset sin dispositivo vinculado → genera OTP (lo ve el admin).
 * - Match aproximado → devuelve sugerencia para confirmar ("¿Sos Fulano?").
 * - Ya vinculado / no encontrado → rechazo registrado en asistencia_rechazada.
 */
marcarRouter.post("/marcar/identificar", validateBody(identificarSchema), async (req, res) => {
  const { orgSlug, sucursalId, nombre } = req.body as { orgSlug: string; sucursalId: string; nombre: string };

  const org = await getOrgBySlug(orgSlug);
  if (!org) {
    res.status(404).json({ error: "Organización no encontrada" });
    return;
  }
  const sucursal = await getSucursal(org.id, sucursalId);
  if (!sucursal || !sucursal.activa) {
    res.status(404).json({ error: "Sucursal no encontrada" });
    return;
  }

  const resultado = await buscarEnNomina(org.id, nombre);
  if (!resultado) {
    await registrarRechazo(org.id, {
      sucursal_id: sucursal.id,
      motivo: "nombre_no_encontrado",
    });
    res.status(404).json({
      error: "No encontramos ese nombre en la nómina. Escribilo como figura en tu recibo o avisale a tu encargado.",
    });
    return;
  }

  const { empleado, exacto } = resultado;

  if (empleado.device_token) {
    await registrarRechazo(org.id, {
      empleado_id: empleado.id,
      sucursal_id: sucursal.id,
      motivo: "dispositivo_ya_vinculado",
    });
    res.status(409).json({
      error: "Este nombre ya está vinculado a otro dispositivo. Avisale a tu encargado.",
    });
    return;
  }

  if (!exacto) {
    res.json({ sugerencia: nombreCompleto(empleado) });
    return;
  }

  await generarOtp(org.id, empleado.id);
  res.json({ empleadoId: empleado.id });
});

/**
 * Paso 2 del marcado público: verificar el código OTP y vincular el
 * dispositivo (cookie httpOnly oliver_device).
 */
marcarRouter.post("/marcar/verificar", validateBody(verificarSchema), async (req, res) => {
  const { empleadoId, code } = req.body as { empleadoId: string; code: string };

  const empleado = await getEmpleadoById(empleadoId);
  if (!empleado || !["activo", "de_licencia"].includes(empleado.estado)) {
    res.status(404).json({ error: "Empleado no encontrado" });
    return;
  }

  const resultado = await verificarOtp(empleado.id, code);
  if (!resultado.ok) {
    if (resultado.motivo === "incorrecto") {
      res.status(400).json({ error: "Código incorrecto. Revisalo y probá de nuevo." });
      return;
    }
    res.status(400).json({
      error: "El código venció o quedó bloqueado. Pedile uno nuevo a tu encargado.",
    });
    return;
  }

  const token = nuevoDeviceToken();
  await vincularDispositivo(empleado.org_id, empleado.id, token);
  setDeviceCookie(res, token);

  res.json({ ok: true, nombre: nombreCompleto(empleado) });
});

/**
 * Paso 3 del marcado público: registrar entrada/salida con geocerca.
 * Requiere la cookie de dispositivo (vínculo previo con OTP).
 */
marcarRouter.post("/marcar/registrar", validateBody(registrarSchema), async (req, res) => {
  const token = getDeviceToken(req);
  if (!token) {
    res.status(401).json({ error: "Dispositivo no vinculado" });
    return;
  }

  const { sucursalId, tipo, lat, lon } = req.body as {
    sucursalId: string;
    tipo: TipoMarca;
    lat: number;
    lon: number;
  };

  const empleado = await getEmpleadoByToken(token);
  if (!empleado) {
    res.status(401).json({ error: "Dispositivo no vinculado" });
    return;
  }

  const sucursal = await getSucursal(empleado.org_id, sucursalId);
  if (!sucursal || !sucursal.activa) {
    res.status(404).json({ error: "Sucursal no encontrada" });
    return;
  }

  const resultado = await registrarMarca(empleado.org_id, empleado.id, sucursal, tipo, lat, lon);

  if (!resultado.ok) {
    if (resultado.motivo === "sucursal_sin_gps") {
      res.status(422).json({
        error: "Esta sucursal no tiene la ubicación configurada. Avisale a tu encargado.",
      });
      return;
    }
    res.status(422).json({
      error: `Estás a ${resultado.distancia} m de la sucursal (máximo ${sucursal.radio_metros} m).`,
    });
    return;
  }

  res.json({ ok: true, tipo, hora: resultado.asistencia.created_at });
});
