import type { Request, Response, NextFunction } from "express";

const rutas = new Map<string, { total: number; errores: number; muestras: number[] }>();
/** Ventana acotada en memoria, sin URLs reales, IDs, queries, cuerpos ni tokens. */
export function medirRequest(req: Request, res: Response, next: NextFunction) {
  const inicio = performance.now();
  res.once("finish", () => {
    const ruta = req.route?.path;
    if (typeof ruta !== "string" || ruta.includes("metricas")) return;
    const key = `${req.method} ${ruta}`;
    if (!rutas.has(key) && rutas.size >= 100) return;
    const m = rutas.get(key) ?? { total: 0, errores: 0, muestras: [] };
    m.total++; if (res.statusCode >= 500) m.errores++;
    m.muestras.push(performance.now() - inicio);
    if (m.muestras.length > 200) m.muestras.shift();
    rutas.set(key, m);
  });
  next();
}
export function resumenMetricas() {
  return [...rutas].map(([ruta, m]) => {
    const orden = [...m.muestras].sort((a, b) => a - b);
    const percentil = (p: number) => Math.round(orden[Math.max(0, Math.ceil(orden.length * p) - 1)] * 10) / 10;
    return { ruta, requests: m.total, errores5xx: m.errores, muestras: orden.length, p50ms: percentil(0.5), p95ms: percentil(0.95) };
  });
}
