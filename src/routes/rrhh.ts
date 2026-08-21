import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireModulo } from "../middleware/require-modulo.js";
import { requireRole } from "../middleware/require-role.js";
import {
  listAusencias,
  insertAusencia,
  updateAusencia,
  deleteAusencia,
  getRrhhCategorias,
  setRrhhCategorias,
  calcularResumenAusencias,
} from "../lib/rrhh.js";
import { getEmpleadoById } from "../lib/empleados.js";
import { getSucursal } from "../lib/sucursales.js";
import { generarExcel, enviarExcel } from "../lib/excel.js";

interface ListQuery {
  desde?: string;
  hasta?: string;
  sucursalId?: string;
  motivo?: string;
  empleadoId?: string;
}

interface CrearAusenciaBody {
  empleado_id?: string;
  sucursal_id?: string | null;
  fecha_desde?: string;
  fecha_hasta?: string;
  motivo?: string;
  detalle?: string | null;
  contacto?: string | null;
  certificado_pendiente?: boolean;
}

interface EditarAusenciaBody {
  sucursal_id?: string | null;
  fecha_desde?: string;
  fecha_hasta?: string;
  motivo?: string;
  detalle?: string | null;
  contacto?: string | null;
  certificado_pendiente?: boolean;
}

interface CategoriasBody {
  categorias?: string[];
}

export const rrhhRouter = Router();

rrhhRouter.get(
  "/ausencias",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<Record<string, never>, unknown, unknown, ListQuery>, res: Response) => {
    const ausencias = await listAusencias(req.org!.id, req.query);
    res.json({ ausencias, resumen: calcularResumenAusencias(ausencias) });
  }
);

rrhhRouter.post(
  "/ausencias",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<unknown, unknown, CrearAusenciaBody>, res: Response) => {
    const { empleado_id, sucursal_id, fecha_desde, fecha_hasta, motivo, detalle, contacto, certificado_pendiente } =
      req.body ?? {};
    if (!empleado_id || !fecha_desde || !fecha_hasta || !motivo?.trim()) {
      res.status(400).json({ error: "Faltan datos de la ausencia" });
      return;
    }
    const empleado = await getEmpleadoById(empleado_id);
    if (!empleado || empleado.org_id !== req.org!.id) {
      res.status(400).json({ error: "Empleado inválido" });
      return;
    }
    if (sucursal_id) {
      const sucursal = await getSucursal(req.org!.id, sucursal_id);
      if (!sucursal) {
        res.status(400).json({ error: "Sucursal inválida" });
        return;
      }
    }
    await insertAusencia(req.org!.id, {
      empleado_id,
      sucursal_id,
      fecha_desde,
      fecha_hasta,
      motivo: motivo.trim(),
      detalle,
      contacto,
      certificado_pendiente,
    });
    res.json({ ok: true });
  }
);

rrhhRouter.patch(
  "/ausencias/:id",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }, unknown, EditarAusenciaBody>, res: Response) => {
    const body = req.body ?? {};
    if (body.sucursal_id !== undefined && body.sucursal_id !== null) {
      const sucursal = await getSucursal(req.org!.id, body.sucursal_id);
      if (!sucursal) {
        res.status(400).json({ error: "Sucursal inválida" });
        return;
      }
    }
    const patch: Parameters<typeof updateAusencia>[2] = {};
    if (body.sucursal_id !== undefined) patch.sucursal_id = body.sucursal_id;
    if (body.fecha_desde !== undefined) patch.fecha_desde = body.fecha_desde;
    if (body.fecha_hasta !== undefined) patch.fecha_hasta = body.fecha_hasta;
    if (body.motivo !== undefined) {
      if (!body.motivo.trim()) {
        res.status(400).json({ error: "Faltan datos de la ausencia" });
        return;
      }
      patch.motivo = body.motivo.trim();
    }
    if (body.detalle !== undefined) patch.detalle = body.detalle;
    if (body.contacto !== undefined) patch.contacto = body.contacto;
    if (body.certificado_pendiente !== undefined) patch.certificado_pendiente = body.certificado_pendiente;
    await updateAusencia(req.org!.id, req.params.id, patch);
    res.json({ ok: true });
  }
);

rrhhRouter.delete(
  "/ausencias/:id",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }>, res: Response) => {
    await deleteAusencia(req.org!.id, req.params.id);
    res.json({ ok: true });
  }
);

rrhhRouter.get("/settings/rrhh-categorias", requireAuth, requireOrg, requireModulo("rrhh"), requireRole("owner", "admin"), async (req: Request, res: Response) => {
  res.json({ categorias: await getRrhhCategorias(req.org!.id) });
});

rrhhRouter.patch(
  "/settings/rrhh-categorias",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<unknown, unknown, CategoriasBody>, res: Response) => {
    const categorias = req.body?.categorias;
    if (!Array.isArray(categorias) || categorias.some((c) => typeof c !== "string" || !c.trim())) {
      res.status(400).json({ error: "Categorías inválidas" });
      return;
    }
    await setRrhhCategorias(req.org!.id, categorias);
    res.json({ ok: true });
  }
);

rrhhRouter.get(
  "/ausencias/export",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<Record<string, never>, unknown, unknown, ListQuery>, res: Response) => {
    const ausencias = await listAusencias(req.org!.id, req.query);

    const buffer = await generarExcel([
      {
        nombre: "Ausencias",
        columnas: [
          { header: "Empleado", key: "empleado", width: 26 },
          { header: "Sucursal", key: "sucursal", width: 22 },
          { header: "Fecha desde", key: "desde", width: 14 },
          { header: "Fecha hasta", key: "hasta", width: 14 },
          { header: "Motivo", key: "motivo", width: 24 },
          { header: "Certificado pendiente", key: "certificado", width: 20 },
          { header: "Detalle", key: "detalle", width: 32 },
          { header: "Contacto", key: "contacto", width: 22 },
        ],
        filas: ausencias.map((a) => ({
          empleado: a.empleado_nombre,
          sucursal: a.sucursal_nombre ?? "—",
          desde: a.fecha_desde,
          hasta: a.fecha_hasta,
          motivo: a.motivo,
          certificado: a.certificado_pendiente ? "Sí" : "No",
          detalle: a.detalle ?? "",
          contacto: a.contacto ?? "",
        })),
      },
    ]);

    const desde = req.query.desde ?? "todas";
    const hasta = req.query.hasta ?? "todas";
    enviarExcel(res, buffer, `rrhh_${desde}_${hasta}.xlsx`);
  }
);
