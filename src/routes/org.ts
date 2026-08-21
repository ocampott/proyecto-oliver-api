import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireRole } from "../middleware/require-role.js";
import { getCurrentOrg } from "../lib/org.js";
import { getEntitlements } from "../lib/planes.js";
import { updateOrganization } from "../lib/organizations.js";
import { listMiembros, invitarMiembro, eliminarMiembro } from "../lib/miembros.js";

export const orgRouter = Router();

orgRouter.get("/org/current", requireAuth, async (req, res) => {
  const org = await getCurrentOrg(req.user!.id);
  if (!org) {
    res.status(404).json({
      error: "Tu cuenta todavía no está asociada a ninguna organización.",
    });
    return;
  }
  const entitlements = await getEntitlements(org.id, req.user!.id);
  res.json({ ...org, plan: entitlements.plan.slug, entitlements });
});

interface EditarOrgBody {
  name?: string;
}

orgRouter.patch(
  "/org/current",
  requireAuth,
  requireOrg,
  requireRole("owner"),
  async (req: Request<unknown, unknown, EditarOrgBody>, res: Response) => {
    const { name } = req.body ?? {};
    if (!name?.trim()) {
      res.status(400).json({ error: "El nombre es requerido" });
      return;
    }
    const org = await updateOrganization(req.org!.id, { name: name.trim() });
    res.json(org);
  }
);

orgRouter.get("/org/miembros", requireAuth, requireOrg, requireRole("owner", "admin"), async (req: Request, res: Response) => {
  const miembros = await listMiembros(req.org!.id);
  res.json(miembros);
});

interface InvitarBody {
  email?: string;
}

orgRouter.post(
  "/org/miembros",
  requireAuth,
  requireOrg,
  requireRole("owner"),
  async (req: Request<unknown, unknown, InvitarBody>, res: Response) => {
    const { email } = req.body ?? {};
    if (!email?.trim()) {
      res.status(400).json({ error: "El email es requerido" });
      return;
    }
    try {
      const miembro = await invitarMiembro(req.org!.id, email.trim());
      res.status(201).json(miembro);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "No se pudo invitar al usuario" });
    }
  }
);

orgRouter.delete(
  "/org/miembros/:userId",
  requireAuth,
  requireOrg,
  requireRole("owner"),
  async (req: Request<{ userId: string }>, res: Response) => {
    try {
      await eliminarMiembro(req.org!.id, req.params.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "No se pudo quitar al usuario" });
    }
  }
);
