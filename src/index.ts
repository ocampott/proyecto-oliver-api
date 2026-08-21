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

const app = express();

app.use(compression());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
  })
);
app.use(cookieParser());
app.use(express.json());

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

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Algo salió mal. Probá de nuevo." });
});

app.listen(env.port, "0.0.0.0", () => {
  console.log(`API escuchando en http://0.0.0.0:${env.port}`);
});
