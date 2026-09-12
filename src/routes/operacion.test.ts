import express from "express";
import type { Server } from "node:http";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers["x-user"]) { res.status(401).json({ error: "No autorizado" }); return; }
    req.user = { id: "10000000-0000-4000-8000-000000000001", email: "admin@test" }; next();
  },
}));
vi.mock("../middleware/require-org.js", () => ({
  requireOrg: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.org = { id: "org-a", name: "Org A", slug: "a", plan: "basico", role: req.headers["x-role"] === "owner" ? "owner" : "agent" }; next();
  },
}));
vi.mock("../middleware/require-modulo.js", () => ({ requireModulo: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() }));
vi.mock("../lib/admin.js", () => ({ checkPlatformAdmin: async () => false }));
vi.mock("../lib/supabase-service.js", () => ({ createServiceClient: vi.fn() }));
vi.mock("../lib/operacion.js", () => ({ guardarCierre: vi.fn(), revisionOperacion: vi.fn() }));
import { createServiceClient } from "../lib/supabase-service.js";
import { guardarCierre } from "../lib/operacion.js";
import { operacionRouter } from "./operacion.js";
import { OperacionError } from "../lib/operacion-validacion.js";
const rpc = vi.fn();
let server: Server, base: string;
const id = "10000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(operacionRouter);
  app.use((e: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(e instanceof OperacionError ? e.status : 500).json({ error: e.message }));
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())));
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: {}, error: null }); vi.mocked(createServiceClient).mockReturnValue({ rpc } as never); });
const post = (headers: Record<string, string>, body: unknown, path = `/ausencias/${id}/decision`) => fetch(base + path, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const decision = { estado: "aprobada", revision: 1, comentario: "Revisada" };
it("requiere sesión administrativa", async () => {
  expect((await post({}, decision)).status).toBe(401);
  expect((await post({ "x-user": "yes", "x-role": "agent" }, decision)).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it("rechaza payloads incompletos", async () => {
  expect((await post({ "x-user": "yes", "x-role": "owner" }, { ...decision, comentario: "" })).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("toma organización y actor de la sesión, nunca del body", async () => {
  expect((await post({ "x-user": "yes", "x-role": "owner" }, { ...decision, org_id: "org-b", actor: "otro" })).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("decidir_ausencia", expect.objectContaining({ p_org: "org-a", p_actor: "10000000-0000-4000-8000-000000000001", p_revision: 1 }));
});
it("devuelve 409 ante conflicto de revisión", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
  expect((await post({ "x-user": "yes", "x-role": "owner" }, decision)).status).toBe(409);
});
it("el agente tampoco puede cerrar períodos", async () => {
  expect((await post({ "x-user": "yes", "x-role": "agent" }, {}, "/liquidacion/cierres")).status).toBe(403);
  expect(guardarCierre).not.toHaveBeenCalled();
});
