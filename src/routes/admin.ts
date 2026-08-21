import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requirePlatformAdmin } from "../middleware/require-platform-admin.js";
import { createServiceClient } from "../lib/supabase-service.js";
import { createOrganization } from "../lib/organizations.js";
import { PERIODOS, PLANES, type PlanSlug } from "../lib/planes.js";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
}

interface CrearBody {
  name?: string;
  slug?: string;
}

interface SuscripcionRow {
  id: string;
  org_id: string;
  plan: PlanSlug;
  periodo_meses: number;
  precio_total: number | null;
  inicia_at: string;
  vence_at: string;
  estado: string;
  notas: string | null;
  created_at: string;
}

interface CrearSuscripcionBody {
  plan?: PlanSlug;
  periodoMeses?: number;
  precioTotal?: number;
  notas?: string;
}

interface CancelarSuscripcionBody {
  estado?: string;
}

function sumarMeses(fecha: Date, meses: number): Date {
  const result = new Date(fecha);
  result.setMonth(result.getMonth() + meses);
  return result;
}

function calcularPrecioTotal(plan: PlanSlug, periodoMeses: number, precioManual?: number): number {
  if (typeof precioManual === "number") return precioManual;
  const planDef = PLANES[plan];
  if (!planDef.precioMensual) return 0;
  const periodo = PERIODOS.find((p) => p.meses === periodoMeses);
  if (!periodo) return 0;
  return Math.round(planDef.precioMensual * periodo.meses * (1 - periodo.descuento));
}

export const adminRouter = Router();

adminRouter.get(
  "/admin/organizations",
  requireAuth,
  requirePlatformAdmin,
  async (_req: Request, res: Response) => {
    const service = createServiceClient();
    const { data, error } = await service
      .from("organizations")
      .select("id, name, slug, plan, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data as OrganizationRow[]);
  }
);

adminRouter.post(
  "/admin/organizations",
  requireAuth,
  requirePlatformAdmin,
  async (req: Request<unknown, unknown, CrearBody>, res: Response) => {
    const { name, slug } = req.body ?? {};
    if (!name?.trim() || !slug?.trim()) {
      res.status(400).json({ error: "name y slug son requeridos" });
      return;
    }
    try {
      const org = await createOrganization({ name: name.trim(), slug: slug.trim() });
      res.status(201).json(org);
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "Error al crear la organización",
      });
    }
  }
);

adminRouter.get(
  "/admin/organizations/:id/suscripciones",
  requireAuth,
  requirePlatformAdmin,
  async (req: Request<{ id: string }>, res: Response) => {
    const service = createServiceClient();
    const { data, error } = await service
      .from("suscripciones")
      .select("*")
      .eq("org_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ suscripciones: (data ?? []) as SuscripcionRow[] });
  }
);

adminRouter.post(
  "/admin/organizations/:id/suscripciones",
  requireAuth,
  requirePlatformAdmin,
  async (req: Request<{ id: string }, unknown, CrearSuscripcionBody>, res: Response) => {
    const { plan, periodoMeses, precioTotal, notas } = req.body ?? {};
    const periodosValidos = PERIODOS.map((p) => p.meses);

    if (!plan || !(plan in PLANES) || plan === "gratis") {
      res.status(400).json({ error: "Plan inválido" });
      return;
    }
    if (!periodoMeses || !periodosValidos.includes(periodoMeses)) {
      res.status(400).json({ error: "Período inválido" });
      return;
    }

    const service = createServiceClient();
    const orgId = req.params.id;

    const { data: activa } = await service
      .from("suscripciones")
      .select("id")
      .eq("org_id", orgId)
      .eq("estado", "activa")
      .maybeSingle();

    if (activa) {
      const { error: cancelErr } = await service
        .from("suscripciones")
        .update({ estado: "cancelada" })
        .eq("id", activa.id);
      if (cancelErr) throw cancelErr;
    }

    const ahora = new Date();
    const venceAt = sumarMeses(ahora, periodoMeses).toISOString();
    const precioFinal = calcularPrecioTotal(plan, periodoMeses, precioTotal);

    const { data: nueva, error: insertErr } = await service
      .from("suscripciones")
      .insert({
        org_id: orgId,
        plan,
        periodo_meses: periodoMeses,
        precio_total: precioFinal,
        inicia_at: ahora.toISOString(),
        vence_at: venceAt,
        estado: "activa",
        notas: notas?.trim() || null,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const { error: updateErr } = await service
      .from("organizations")
      .update({ plan })
      .eq("id", orgId);
    if (updateErr) throw updateErr;

    res.status(201).json(nueva);
  }
);

adminRouter.patch(
  "/admin/suscripciones/:id",
  requireAuth,
  requirePlatformAdmin,
  async (req: Request<{ id: string }, unknown, CancelarSuscripcionBody>, res: Response) => {
    const { estado } = req.body ?? {};
    if (estado !== "cancelada") {
      res.status(400).json({ error: "Solo se permite cancelar una suscripción" });
      return;
    }

    const service = createServiceClient();
    const { data: actual, error: readErr } = await service
      .from("suscripciones")
      .select("id, org_id, estado")
      .eq("id", req.params.id)
      .single();
    if (readErr) throw readErr;

    const { error: updateErr } = await service
      .from("suscripciones")
      .update({ estado: "cancelada" })
      .eq("id", actual.id);
    if (updateErr) throw updateErr;

    if (actual.estado === "activa") {
      const { error: orgErr } = await service
        .from("organizations")
        .update({ plan: "gratis" })
        .eq("id", actual.org_id);
      if (orgErr) throw orgErr;
    }

    res.json({ ok: true });
  }
);
