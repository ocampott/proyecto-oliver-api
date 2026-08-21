// Renombra los usuarios qa-* a nombres cortos (sin el prefijo "qa-") y les
// resetea la password a demo123456, para pruebas manuales.
// Uso: node --env-file=.env.local scripts/reset-qa-passwords.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.auth.admin.listUsers();
if (error) throw error;

const targets = data.users.filter((u) => u.email?.startsWith("qa-"));
for (const u of targets) {
  const nuevoEmail = u.email.replace(/^qa-/, "");
  const { error: updErr } = await supabase.auth.admin.updateUserById(u.id, {
    email: nuevoEmail,
    password: "demo123456",
    email_confirm: true,
  });
  console.log(updErr ? `FALLO ${u.email}: ${updErr.message}` : `OK ${u.email} -> ${nuevoEmail}`);
}
