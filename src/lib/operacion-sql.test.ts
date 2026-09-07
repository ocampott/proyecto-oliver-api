import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { it, expect } from "vitest";

it("migra el esquema real y valida decisiones, aislamiento, auditoría y cierres", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
      create publication supabase_realtime;
    `);
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".sql") && n < "0013").sort()) {
      // gen_random_uuid está en PostgreSQL core; PGlite no necesita pgcrypto.
      await db.exec(readFileSync(new URL(file, dir), "utf8").replace("create extension if not exists pgcrypto;", ""));
    }
    const org = "10000000-0000-4000-8000-000000000001", otra = "10000000-0000-4000-8000-000000000002";
    const empleado = "10000000-0000-4000-8000-000000000003", actor = "10000000-0000-4000-8000-000000000004";
    await db.query("insert into organizations(id,name,slug) values($1,'Org A','org-a'),($2,'Org B','org-b')", [org, otra]);
    await db.query("insert into empleados(id,org_id,nombre) values($1,$2,'Ana')", [empleado, org]);
    await db.query("insert into ausencias(org_id,empleado_id,fecha_desde,fecha_hasta,motivo,origen) values($1,$2,'2026-08-10','2026-08-10','Licencia','empleado')", [org, empleado]);
    await db.exec(readFileSync(new URL("0013_operacion_rrhh.sql", dir), "utf8"));
    expect((await db.query<{ estado: string }>("select estado from ausencias")).rows[0].estado).toBe("aprobada");
    const row = (await db.query<{ id: string; estado: string }>("insert into ausencias(org_id,empleado_id,fecha_desde,fecha_hasta,motivo,origen) values($1,$2,'2026-08-11','2026-08-11','Licencia','empleado') returning *", [org, empleado])).rows[0];
    expect(row.estado).toBe("pendiente");
    const decidir = (o: string, rev = 1) => db.query("select decidir_ausencia($1,$2,$3,'aprobada','Verificado',$4,'admin@test')", [o, row.id, rev, actor]);
    await expect(decidir(otra)).rejects.toThrow("cambió");
    await decidir(org);
    await expect(decidir(org)).rejects.toThrow("cambió");
    const historial = await db.query<{ actor_email: string; actual: { estado: string } }>("select * from ausencias_historial where ausencia_id=$1 order by created_at desc", [row.id]);
    expect(historial.rows[0].actor_email).toBe("admin@test");
    expect(historial.rows[0].actual.estado).toBe("aprobada");
    await db.query("update ausencias set detalle='Otro motivo' where id=$1", [row.id]);
    expect((await db.query<{ estado: string }>("select estado from ausencias where id=$1", [row.id])).rows[0].estado).toBe("pendiente");
    const revision = (await db.query<{ revision: string }>("select revision from operacion_revision where org_id=$1", [org])).rows[0].revision;
    const cerrar = () => db.query("select guardar_cierre($1,'2026-08-01','2026-08-31',$2,'{\"filas\":[]}', 'Revisado', $3, 'admin@test')", [org, revision, actor]);
    await cerrar();
    await expect(cerrar()).rejects.toThrow("duplicate");
    await db.query("update empleados set nombre='Ana María' where id=$1", [empleado]);
    await expect(cerrar()).rejects.toThrow("cambiaron");
    expect((await db.query<{ snapshot: unknown }>("select snapshot from liquidacion_cierres")).rows[0].snapshot).toEqual({ filas: [] });
    await db.exec("set role authenticated");
    await expect(db.query("select * from liquidacion_cierres")).rejects.toThrow("permission denied");
    await expect(decidir(org, 3)).rejects.toThrow("permission denied");
    await db.exec("reset role; set role service_role");
    await expect(db.query("update liquidacion_cierres set nota='Alterada'")).rejects.toThrow("permission denied");
    await db.exec("reset role");
    await db.query("delete from organizations where id=$1", [org]);
    expect((await db.query("select * from ausencias_historial")).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30000);
