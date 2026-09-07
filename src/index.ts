import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import { env } from "./env.js";
import { meRouter } from "./routes/me.js";
import { orgRouter } from "./routes/org.js";
import { marcarRouter } from "./routes/marcar.js";
import { sucursalesRouter } from "./routes/sucursales.js";
import { empleadosRouter } from "./routes/empleados.js";
import { asistenciaRouter } from "./routes/asistencia.js";
import { horasRouter } from "./routes/horas.js";
import { turnosRouter } from "./routes/turnos.js";
import { rrhhRouter } from "./routes/rrhh.js";
import { adminRouter } from "./routes/admin.js";
import { planesRouter } from "./routes/planes.js";
import { placesRouter } from "./routes/places.js";
import { liquidacionRouter } from "./routes/liquidacion.js";
import { legajosRouter } from "./routes/legajos.js";
import { vacacionesRouter } from "./routes/vacaciones.js";
import { chatRouter } from "./routes/chat.js";

import { portalRouter } from "./routes/portal.js";
import { operacionRouter } from "./routes/operacion.js";
import { OperacionError } from "./lib/operacion-validacion.js";

import { medirRequest, resumenMetricas } from "./lib/metricas.js";
import { requireAuth } from "./middleware/auth.js";
import { requirePlatformAdmin } from "./middleware/require-platform-admin.js";

const app = express();
app.use(medirRequest);


app.use(compression());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
  })
);
app.use(cookieParser());
// 100kb alcanza y sobra para los bodies de esta API (spec §2.5) — corta
// requests gigantes antes de que lleguen a cualquier handler.
app.use(express.json({ limit: "100kb" }));

app.get("/api/admin/metricas", requireAuth, requirePlatformAdmin, (_req, res) => {
  res.json({ alcance: "Últimas 200 muestras por ruta en este proceso; se reinicia al desplegar.", rutas: resumenMetricas() });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api", meRouter);
app.use("/api", orgRouter);
app.use("/api", marcarRouter);
app.use("/api", sucursalesRouter);
app.use("/api", empleadosRouter);
app.use("/api", asistenciaRouter);
app.use("/api", horasRouter);
app.use("/api", turnosRouter);
app.use("/api", rrhhRouter);
app.use("/api", adminRouter);
app.use("/api", planesRouter);
app.use("/api", placesRouter);
app.use("/api", liquidacionRouter);
app.use("/api", legajosRouter);
app.use("/api", vacacionesRouter);
app.use("/api", chatRouter);
app.use("/api", operacionRouter);
app.use("/api", portalRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof OperacionError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Algo salió mal. Probá de nuevo." });
});

app.listen(env.port, "0.0.0.0", () => {
  console.log(`API escuchando en http://0.0.0.0:${env.port}`);
});
