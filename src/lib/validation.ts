import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

/**
 * Middleware genérico de validación de body con zod (spec §2.5). Si el body
 * no cumple el schema, corta con 400 antes de llegar al handler — nada de
 * `req.body as X` confiando ciegamente en lo que mandó el cliente.
 * Reemplaza req.body por los datos ya parseados (trim, coerción, etc).
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Datos inválidos",
        detalles: result.error.issues.map((i) => ({ campo: i.path.join(".") || "body", mensaje: i.message })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
