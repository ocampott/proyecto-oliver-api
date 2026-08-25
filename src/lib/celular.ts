// Normalización de celulares argentinos a +54 9 <10 dígitos> — sin DB,
// sin env. No intenta separar código de área de número local (variable
// entre 2 y 4 dígitos según la zona) — alcanza con un formato consistente
// para poder mandar WhatsApp más adelante.

export function normalizarCelular(input: string): string | null {
  let digitos = input.replace(/\D/g, "");

  if (digitos.startsWith("0")) digitos = digitos.slice(1);
  if (digitos.startsWith("54")) digitos = digitos.slice(2);
  if (digitos.startsWith("9")) digitos = digitos.slice(1);

  if (!/^\d{10}$/.test(digitos)) return null;

  return `+54 9 ${digitos}`;
}
