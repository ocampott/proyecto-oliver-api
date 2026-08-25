// Uso:
//   node --env-file=.env.local scripts/split-apellido.js            (dry-run)
//   node --env-file=.env.local scripts/split-apellido.js --aplicar  (aplica)
//
// Separa el campo "nombre" (texto libre) de los empleados que todavía no
// tienen apellido cargado, con la heurística "última palabra = apellido,
// resto = nombre". Imprime la tabla de cambios propuestos para revisión —
// los apellidos compuestos van a salir mal separados y hay que corregirlos
// a mano desde /empleados después de correr esto.
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function splitNombre(nombreCompleto) {
  const palabras = nombreCompleto.trim().split(/\s+/);
  if (palabras.length < 2) return { apellido: "", nombre: nombreCompleto.trim() };
  const apellido = palabras[palabras.length - 1];
  const nombre = palabras.slice(0, -1).join(" ");
  return { apellido, nombre };
}

async function main() {
  const { data: empleados, error } = await supabase
    .from("empleados")
    .select("id, nombre, apellido")
    .is("apellido", null);
  if (error) throw error;

  console.log(`${empleados.length} empleados sin apellido cargado.\n`);

  for (const e of empleados) {
    const { apellido, nombre } = splitNombre(e.nombre);
    console.log(`${e.id}  "${e.nombre}"  →  apellido="${apellido}" nombre="${nombre}"`);
    if (APLICAR) {
      const { error: updErr } = await supabase.from("empleados").update({ apellido, nombre }).eq("id", e.id);
      if (updErr) throw updErr;
    }
  }

  console.log(APLICAR ? "\nAplicado." : "\nDry-run — no se tocó nada. Corré con --aplicar para aplicar los cambios.");
}

main();
