// Validación de CUIL con dígito verificador módulo 11 — sin DB, sin env.

const MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function validarCuil(cuil: string): boolean {
  const digitos = cuil.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digitos)) return false;

  const nums = digitos.split("").map(Number);
  const suma = MULTIPLICADORES.reduce((acc, mult, i) => acc + mult * nums[i], 0);
  const resto = suma % 11;
  let verificador = 11 - resto;
  if (verificador === 11) verificador = 0;
  if (verificador === 10) return false; // CUIL matemáticamente inválido

  return verificador === nums[10];
}
