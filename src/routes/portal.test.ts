import express from "express";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Server } from "node:http";
vi.mock("../lib/device-token.js", () => ({ getDeviceToken: (req: express.Request) => req.headers["x-device"] ?? null }));
vi.mock("../lib/empleados.js", () => ({ getEmpleadoByToken: vi.fn() }));
vi.mock("../lib/org.js", () => ({ getOrgBySlug: vi.fn() }));
vi.mock("../lib/planes.js", () => ({ getEntitlements: vi.fn(), tieneModulo: vi.fn() }));
vi.mock("../lib/legajos.js", () => ({ getLegajoArchivo: vi.fn(), descargarLegajoArchivo: vi.fn() }));
vi.mock("../lib/turnos.js", () => ({ listHorarios: vi.fn() }));
vi.mock("../lib/supabase-service.js", () => ({ createServiceClient: vi.fn() }));
import { getEmpleadoByToken } from "../lib/empleados.js";
import { getOrgBySlug } from "../lib/org.js";
import { tieneModulo } from "../lib/planes.js";
import { getLegajoArchivo, descargarLegajoArchivo } from "../lib/legajos.js";
import { createServiceClient } from "../lib/supabase-service.js";
import { listHorarios } from "../lib/turnos.js";
import { portalRouter } from "./portal.js";
import { OperacionError } from "../lib/operacion-validacion.js";
let server: Server;
let base: string;
const eq = vi.fn();
beforeAll(async () => {
  const app = express(); app.use(portalRouter);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error instanceof OperacionError ? error.status : 500).json({ error: error.message }));
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEmpleadoByToken).mockResolvedValue({ id: "e1", org_id: "org1", nombre: "Ana", fecha_ingreso: "2020-01-01" } as never);
  vi.mocked(getOrgBySlug).mockResolvedValue({ id: "org1", slug: "mi-org", plan: "basico" } as never);
  vi.mocked(tieneModulo).mockReturnValue(true);
  vi.mocked(listHorarios).mockResolvedValue([]);
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "gte", "lte", "ilike", "order", "limit"]) chain[method] = () => chain;
  chain.eq = eq.mockImplementation(() => chain);
  chain.then = (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  vi.mocked(createServiceClient).mockReturnValue({ from: () => chain } as never);
});
it("rechaza dispositivos sin vínculo", async () => {
  expect((await fetch(`${base}/portal/mi-org`)).status).toBe(401);
  expect(getOrgBySlug).not.toHaveBeenCalled();
});
it("rechaza organización distinta de la del dispositivo", async () => {
  vi.mocked(getOrgBySlug).mockResolvedValue({ id: "otra-org" } as never);
  expect((await fetch(`${base}/portal/otra-org`, { headers: { "x-device": "token" } })).status).toBe(404);
  expect(createServiceClient).not.toHaveBeenCalled();
});
it("respeta el módulo habilitado", async () => {
  vi.mocked(tieneModulo).mockReturnValue(false);
  expect((await fetch(`${base}/portal/mi-org`, { headers: { "x-device": "token" } })).status).toBe(403);
});
it("consulta solo el empleado autenticado e ignora IDs enviados por query", async () => {
  const res = await fetch(`${base}/portal/mi-org?empleadoId=otra-persona`, { headers: { "x-device": "token" } });
  expect(res.status).toBe(200);
  expect(listHorarios).toHaveBeenCalledWith("org1", "e1");
  expect(eq.mock.calls.filter(([k]) => k === "empleado_id")).toEqual([["empleado_id", "e1"], ["empleado_id", "e1"], ["empleado_id", "e1"]]);
  expect(eq).toHaveBeenCalledWith("visible_empleado", true);
  expect(res.headers.get("cache-control")).toBe("no-store");
});
it.each([
  { empleado_id: "otro", visible_empleado: true },
  { empleado_id: "e1", visible_empleado: false },
])("no entrega documentos ajenos o privados %j", async (archivo) => {
  vi.mocked(getLegajoArchivo).mockResolvedValue(archivo as never);
  const res = await fetch(`${base}/portal/mi-org/archivos/10000000-0000-4000-8000-000000000001`, { headers: { "x-device": "token" } });
  expect(res.status).toBe(404);
  expect(descargarLegajoArchivo).not.toHaveBeenCalled();
});
it("entrega un documento compartido propio como descarga, no HTML ejecutable", async () => {
  vi.mocked(getLegajoArchivo).mockResolvedValue({ empleado_id: "e1", visible_empleado: true, nombre_original: "archivo.html" } as never);
  vi.mocked(descargarLegajoArchivo).mockResolvedValue(Buffer.from("<h1>Test</h1>"));
  const res = await fetch(`${base}/portal/mi-org/archivos/10000000-0000-4000-8000-000000000001`, { headers: { "x-device": "token" } });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toContain("attachment");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
});
