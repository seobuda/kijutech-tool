import 'server-only';
import { PermissionError } from '@/lib/auth/permissions';

// Errores que describen infraestructura (base de datos, red, rutas, trazas): nunca al usuario.
const TECHNICAL =
  /failed query|relation "|column "|violates|duplicate key|syntax error|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|node_modules|\/app\/|\bat .+\(.+:\d+:\d+\)|postgres|drizzle|PostgresError|\bpg_|jwt|JWSInvalid|JWEDecryptionFailed/i;

/**
 * Mensaje apto para enseñar al usuario. Los errores con texto pensado para la persona (los que
 * lanza nuestro código en español) pasan tal cual; los técnicos se sustituyen por `fallback` y el
 * detalle completo se queda solo en los logs del servidor (docker logs kijutech_app).
 */
export function publicError(e: unknown, fallback: string): string {
  if (e instanceof PermissionError) return e.message;
  const msg = e instanceof Error ? e.message : '';
  if (!msg || msg.length > 240 || TECHNICAL.test(msg)) {
    console.error(`[error] ${fallback}:`, e);
    return fallback;
  }
  return msg;
}
