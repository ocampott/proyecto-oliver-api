import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getCurrentOrg } from "../lib/org.js";
import { getEntitlements } from "../lib/planes.js";

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
