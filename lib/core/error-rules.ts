// Registro central de errores (núcleo, 17 nov 2026): reglas puras, sin base de datos ni red. Huella para agrupar, limpieza
// de secretos, lectura de una línea de consola («[agente] herramienta crear_encargo: …») y el texto de los avisos.
import { createHash } from 'node:crypto';

export type Severity = 'aviso' | 'error' | 'critico';
export type ErrorStatus = 'nuevo' | 'investigando' | 'resuelto' | 'ignorado';
export const SEVERITIES: Severity[] = ['aviso', 'error', 'critico'];
export const STATUSES: ErrorStatus[] = ['nuevo', 'investigando', 'resuelto', 'ignorado'];
export const SEVERITY_LABEL: Record<Severity, string> = { aviso: 'Aviso', error: 'Error', critico: 'Crítico' };
export const STATUS_LABEL: Record<ErrorStatus, string> = { nuevo: 'Nuevo', investigando: 'Investigando', resuelto: 'Resuelto', ignorado: 'Ignorado' };
export const severityRank = (s: string) => Math.max(0, SEVERITIES.indexOf(s as Severity));

// Etiqueta de consola → módulo. Lo que no está aquí se guarda con la etiqueta tal cual.
const SOURCE_BY_TAG: Record<string, string> = {
  agente: 'agentes',
  agentes: 'agentes',
  estrategia: 'estrategia',
  rendimiento: 'rendimiento',
  operaciones: 'operaciones',
  ops: 'operaciones',
  telegram: 'operaciones',
  clickup: 'operaciones',
  outbox: 'operaciones',
  jornada: 'operaciones',
  correo: 'operaciones',
  email: 'operaciones',
  ia: 'ia',
  ai: 'ia',
  seo: 'seo',
  núcleo: 'núcleo',
  nucleo: 'núcleo',
  core: 'núcleo',
  error: 'núcleo'
};

/** Quita secretos de un texto antes de guardarlo (claves, tokens, contraseñas en URLs, cabeceras de autorización). */
export function scrub(text: string): string {
  return text
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, '$1-***')
    .replace(/\bsk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-***')
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, '***:bot-token***')
    .replace(/\bpk_[A-Za-z0-9_]{20,}/g, 'pk_***')
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***')
    .replace(/((?:api[_-]?key|token|secret|password|passwd|pwd|authorization|access_token|refresh_token|client_secret)["']?\s*[:=]\s*["']?)[^\s"'&,;}]{4,}/gi, '$1***')
    .replace(/([?&](?:key|token|access_token|api_key|secret|sig|signature)=)[^&\s]+/gi, '$1***')
    .replace(/(postgres(?:ql)?:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1***@')
    .replace(/(https?:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1***@');
}

/** Mensaje sin lo que cambia de una vez a otra (ids, números, URLs, correos): así el mismo fallo cae en el mismo grupo. */
export function normalizeMessage(message: string): string {
  return scrub(message)
    .split('\n')[0]
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<correo>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/"[^"]{30,}"/g, '"…"')
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function fingerprint(tenantId: string | null, source: string, area: string, message: string): string {
  return createHash('sha256').update([tenantId ?? 'sistema', source, area, normalizeMessage(message)].join('|')).digest('hex').slice(0, 64);
}

export type ParsedConsole = { source: string; area: string; message: string; stack: string | null; error: unknown };

function errorText(v: unknown): { message: string; stack: string | null } {
  if (v instanceof Error) {
    const cause = (v as Error & { cause?: unknown }).cause;
    const causeText = cause instanceof Error ? ` (causa: ${cause.message})` : '';
    return { message: `${v.name && v.name !== 'Error' ? `${v.name}: ` : ''}${v.message}${causeText}`, stack: v.stack ?? null };
  }
  if (typeof v === 'string') return { message: v, stack: null };
  try {
    return { message: JSON.stringify(v)?.slice(0, 2000) ?? String(v), stack: null };
  } catch {
    return { message: String(v), stack: null };
  }
}

/**
 * Lee los argumentos de un console.error/console.warn. Convención del proyecto: «[etiqueta] zona:» y después el error.
 * Devuelve el módulo (por la etiqueta), la zona («agente herramienta crear_encargo»), el mensaje y la traza si la hay.
 */
export function parseConsoleArgs(args: unknown[]): ParsedConsole {
  const parts = args.map(errorText);
  const first = typeof args[0] === 'string' ? args[0] : '';
  const m = first.match(/^\s*\[([^\]]{1,40})\]\s*([^:]{0,100}):?\s*([\s\S]*)$/);
  const stack = parts.find((p) => p.stack)?.stack ?? null;
  const error = args.find((a) => a instanceof Error) ?? null;
  if (m) {
    const tag = m[1].trim().toLowerCase();
    const source = SOURCE_BY_TAG[tag] ?? (tag.replace(/[^a-z0-9áéíóúñ_-]/g, '').slice(0, 40) || 'sistema');
    const area = `${tag}${m[2].trim() ? ` ${m[2].trim()}` : ''}`.slice(0, 120);
    const rest = [m[3], ...parts.slice(1).map((p) => p.message)].filter((x) => x && x.trim()).join(' ');
    return { source, area, message: rest || area, stack, error };
  }
  const message = parts.map((p) => p.message).filter(Boolean).join(' ');
  return { source: 'sistema', area: '', message: message || '(sin mensaje)', stack, error };
}

/** Líneas de consola que no son errores de la herramienta (ruido de librerías) y no se guardan. */
export function isNoise(message: string): boolean {
  return /ExperimentalWarning|DeprecationWarning|punycode|Browserslist: caniuse-lite is outdated|NEXT_REDIRECT|NEXT_NOT_FOUND|DYNAMIC_SERVER_USAGE/i.test(message);
}

/** Gravedad por defecto según cómo llegó y qué dice. */
export function guessSeverity(kind: 'error' | 'warn', message: string): Severity {
  if (kind === 'warn') return 'aviso';
  if (/ECONNREFUSED.*5432|too many clients|out of memory|heap|FATAL|could not connect to server|database .* does not exist/i.test(message)) return 'critico';
  return 'error';
}

/** Recorta un valor para guardarlo como contexto (sin secretos, sin objetos enormes). */
export function safeContext(value: unknown, max = 4000): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  let text: string;
  try {
    text = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v instanceof Error ? { name: v.name, message: v.message } : v));
  } catch {
    return { valor: String(value).slice(0, max) };
  }
  if (!text) return {};
  const clean = scrub(text);
  if (clean.length <= max) {
    try {
      const parsed = JSON.parse(clean);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { valor: parsed };
    } catch {
      return { valor: clean.slice(0, max) };
    }
  }
  return { recortado: clean.slice(0, max) };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Aviso por Telegram de un error nuevo (o que vuelve tras resolverse). */
export function alertMessage(g: { title: string; source: string; area: string; severity: string; occurrences: number; reopened: boolean; userMessage?: string | null; link: string | null }): string {
  const icon = g.severity === 'critico' ? '🔴' : g.severity === 'error' ? '🟠' : '🟡';
  const lines = [
    `${icon} <b>${g.reopened ? 'Vuelve un error que estaba resuelto' : 'Error nuevo en la herramienta'}</b>`,
    `<b>${esc(g.source)}</b>${g.area ? ` · ${esc(g.area)}` : ''}`,
    '',
    `<code>${esc(g.title.slice(0, 400))}</code>`
  ];
  if (g.userMessage) lines.push('', `Lo que vio la persona: «${esc(g.userMessage.slice(0, 300))}»`);
  if (g.occurrences > 1) lines.push('', `Ha pasado ${g.occurrences} veces.`);
  if (g.link) lines.push('', `<a href="${esc(g.link)}">Ver en Errores</a>`);
  return lines.join('\n');
}

/** Texto para pasar un error a quien lo vaya a arreglar (Claude Code): todo lo necesario en un bloque. */
export function fixBrief(g: { title: string; source: string; area: string; severity: string; occurrences: number; firstSeen: string; lastSeen: string; diagnosis: Diagnosis | null }, events: { message: string; stack: string | null; context: unknown; createdAt: string }[]): string {
  const out = [
    `Error de la herramienta (${g.source}${g.area ? ` · ${g.area}` : ''}), gravedad ${g.severity}, ${g.occurrences} veces entre ${g.firstSeen} y ${g.lastSeen}.`,
    '',
    `Mensaje: ${g.title}`
  ];
  const ev = events[0];
  if (ev?.stack) out.push('', 'Traza:', ev.stack.slice(0, 2500));
  if (ev && ev.context && Object.keys(ev.context as object).length) out.push('', `Contexto: ${JSON.stringify(ev.context).slice(0, 1500)}`);
  if (g.diagnosis) {
    out.push('', 'Diagnóstico del Técnico de mantenimiento:', `Causa: ${g.diagnosis.causa}`);
    if (g.diagnosis.evidencia) out.push(`Evidencia: ${g.diagnosis.evidencia}`);
    out.push(`Arreglo propuesto: ${g.diagnosis.arreglo}`);
    if (g.diagnosis.archivos.length) out.push(`Archivos: ${g.diagnosis.archivos.join(', ')}`);
    out.push(`Riesgo: ${g.diagnosis.riesgo} · Confianza: ${g.diagnosis.confianza}/10`);
  }
  out.push('', 'Arréglalo en una rama propia, con su prueba, y marca el error como resuelto en Errores.');
  return out.join('\n');
}

export type Diagnosis = { causa: string; evidencia: string; arreglo: string; archivos: string[]; riesgo: 'bajo' | 'medio' | 'alto'; confianza: number; urgente: boolean };

export function cleanDiagnosis(input: Record<string, unknown>): Diagnosis | null {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const causa = str(input.causa, 3000);
  const arreglo = str(input.arreglo, 6000);
  if (!causa || !arreglo) return null;
  const archivos = Array.isArray(input.archivos) ? input.archivos.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, 15) : [];
  const riesgo = ['bajo', 'medio', 'alto'].includes(String(input.riesgo)) ? (input.riesgo as Diagnosis['riesgo']) : 'medio';
  const conf = Number(input.confianza);
  return { causa, evidencia: str(input.evidencia, 3000), arreglo, archivos, riesgo, confianza: Number.isFinite(conf) ? Math.min(10, Math.max(1, Math.round(conf))) : 5, urgente: input.urgente === true };
}
