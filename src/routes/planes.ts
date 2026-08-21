import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { PERIODOS, PLANES, type PlanSlug } from "../lib/planes.js";

interface PlanCatalogo {
  slug: PlanSlug;
  nombre: string;
  maxSucursales: number | null;
  maxEmpleados: number | null;
  modulos: string[];
  precioMensual: number | null;
  precios: { meses: number; descuento: number; precioTotal: number }[];
}

export const planesRouter = Router();

planesRouter.get("/planes", requireAuth, (_req, res) => {
  const planes: PlanCatalogo[] = Object.values(PLANES).map((plan) => ({
    slug: plan.slug,
    nombre: plan.nombre,
    maxSucursales: plan.maxSucursales,
    maxEmpleados: plan.maxEmpleados,
    modulos: plan.modulos,
    precioMensual: plan.precioMensual,
    precios: PERIODOS.map((p) => ({
      meses: p.meses,
      descuento: p.descuento,
      precioTotal: plan.precioMensual
        ? Math.round(plan.precioMensual * p.meses * (1 - p.descuento))
        : 0,
    })),
  }));

  res.json({ planes });
});
