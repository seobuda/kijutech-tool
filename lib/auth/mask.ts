import 'server-only';

/**
 * Enmascara un secreto para mostrarlo en pantalla: «pk_…a1b2» (hasta 3 caracteres del
 * principio y los 4 últimos). Si es corto, solo se muestran los últimos 2. El valor
 * completo nunca sale del servidor.
 */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return `…${value.slice(-2)}`;
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}
