// Módulo Google Ads · cálculos puros del paso 1 (sin base de datos ni red; se prueban en tests/ads.test.ts).
// Diseño: docs/ads/DISENO-TECNICO-ADS.md v2 (§3.1 cobertura, §4 descarga, §5 MED-00).
import { createHash } from 'node:crypto';

// --- Identificadores ------------------------------------------------------------------------------------------------

/** Id de cuenta de Google Ads a 10 dígitos: acepta «123-456-7890», «123 456 7890» o «1234567890». Lo demás, null. */
export function normalizeCustomerId(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (/^\d{10}$/.test(v)) return v;
  const m = v.match(/(?:^|[^\d])(\d{3})[-\s](\d{3})[-\s](\d{4})(?:[^\d]|$)/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** «1234567890» → «123-456-7890» (como lo enseña Google Ads). */
export function formatCustomerId(id: string): string {
  return /^\d{10}$/.test(id) ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id;
}

/** Último tramo numérico de un nombre de recurso: «customers/1/campaigns/22» → «22». */
export function idFromResource(resource: string | null | undefined): string | null {
  const m = String(resource ?? '').match(/\/(\d+)(?:~[\w~]+)?$/);
  return m ? m[1] : null;
}

// --- Fechas y zonas ---------------------------------------------------------------------------------------------------

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function isYmd(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

type ZonedParts = { date: string; hour: number; minute: number; second: number; weekday: number };

/** Fecha, hora y día de la semana (0 = domingo) de un instante en una zona horaria. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second), weekday };
}

export function zonedDay(at: Date, timeZone: string): string {
  return zonedParts(at, timeZone).date;
}

/** El cupo diario de la API se reinicia a medianoche del Pacífico [verificar en v26]: el contador va en ese día. */
export function pacificDay(at: Date = new Date()): string {
  return zonedDay(at, 'America/Los_Angeles');
}

/** Desfase (ms) de una zona en un instante: hora local − UTC. */
function offsetMs(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Convierte una hora local de la cuenta («2026-10-25 02:30:00.123456», como la da `change_event.change_date_time`, sin
 * desfase) en un instante real. En la hora repetida del cambio de octubre se elige la primera.
 */
export function localToUtc(local: string, timeZone: string): Date | null {
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!m) return null;
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), ms);
  // Los desfases posibles alrededor de esa hora (antes y después de un cambio de horario). Se prueban los dos y se queda
  // la interpretación válida más temprana (hora repetida de octubre); en el hueco de marzo, la de después.
  const offsets = [offsetMs(new Date(naive - 12 * 3_600_000), timeZone), offsetMs(new Date(naive + 12 * 3_600_000), timeZone)];
  const want = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  const valid = [...new Set(offsets)]
    .map((o) => naive - o)
    .filter((t) => {
      const p = zonedParts(new Date(t), timeZone);
      return `${p.date} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` === want;
    })
    .sort((a, b) => a - b);
  return new Date(valid[0] ?? naive - offsets[1]);
}

/** Fecha y hora local de la cuenta en el formato que acepta GAQL para `change_date_time`. */
export function gaqlDateTime(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.date} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** Tramos de histórico hacia atrás: [desde, hasta] de `chunkDays` días, del más reciente al más antiguo. */
export function historyChunks(latest: string, months: number, chunkDays = 90): { from: string; to: string }[] {
  const oldest = addDays(latest, -Math.round(months * 30.44));
  const out: { from: string; to: string }[] = [];
  let to = latest;
  while (to >= oldest) {
    const from = addDays(to, -(chunkDays - 1)) < oldest ? oldest : addDays(to, -(chunkDays - 1));
    out.push({ from, to });
    to = addDays(from, -1);
  }
  return out;
}

// --- Dinero y números -------------------------------------------------------------------------------------------------

/** Micros (texto o número, como los da la API en JSON) → unidades de moneda con 2 decimales. Ausente → null. */
export function fromMicros(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n / 10_000) / 100 : null;
}

/** Número de la API (los int64 llegan como texto). Ausente → null (no 0: «sin dato» no es «cero»). */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- Cobertura: cero frente a «sin dato» (R5 G1) ----------------------------------------------------------------------

export const SOURCE_DELAY_HOURS = 3;

/** ¿Ha cerrado el día D en la zona de la cuenta más el retraso de la fuente? (condición (a) de §3.1). */
export function dayClosed(day: string, timeZone: string, at: Date, delayHours = SOURCE_DELAY_HOURS): boolean {
  const endOfDay = localToUtc(`${addDays(day, 1)} 00:00:00`, timeZone);
  return Boolean(endOfDay) && at.getTime() >= endOfDay!.getTime() + delayHours * 3_600_000;
}

/** ¿Cuadra la consulta de control con la suma de filas de campaña? ±1 % o 1 unidad (condición (b) de §3.1). */
export function controlMatches(control: { cost: number; impressions: number }, rows: { cost: number; impressions: number }): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.01);
  return close(control.cost, rows.cost) && close(control.impressions, rows.impressions);
}

/** Día completo: cerrado y con el control cuadrado. Si no, nota para la pantalla. */
export function coverageVerdict(input: { day: string; timeZone: string; syncedAt: Date; control: { cost: number; impressions: number } | null; rows: { cost: number; impressions: number } }): { complete: boolean; note: string | null } {
  if (!dayClosed(input.day, input.timeZone, input.syncedAt)) return { complete: false, note: 'día sin cerrar' };
  if (!input.control) return { complete: false, note: 'sin consulta de control' };
  if (!controlMatches(input.control, input.rows)) return { complete: false, note: `el total de la cuenta (${input.control.cost}) no cuadra con la suma de campañas (${input.rows.cost})` };
  return { complete: true, note: null };
}

/** ¿Está cubierta toda la ventana [desde, hasta]? Devuelve los días que faltan. */
export function windowCoverage(rows: { day: string; complete: boolean }[], from: string, to: string): { complete: boolean; missing: string[] } {
  const ok = new Set(rows.filter((r) => r.complete).map((r) => r.day));
  const missing: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!ok.has(d)) missing.push(d);
  return { complete: missing.length === 0, missing };
}

// --- MED-00: salud de cada fuente ------------------------------------------------------------------------------------

export const SOURCES = ['descubrir', 'estructura', 'metricas', 'historico', 'cambios', 'latido', 'landing'] as const;
export type AdsSource = (typeof SOURCES)[number];

/** Frescura esperada (minutos). El histórico no es periódico; el latido se mide solo en horario de servicio. */
export const EXPECTED_MINUTES: Record<AdsSource, number> = { descubrir: 1440, estructura: 1440, metricas: 360, historico: 0, cambios: 360, latido: 60, landing: 60 };
export const SOURCE_LABEL: Record<AdsSource, string> = {
  descubrir: 'cuentas de la MCC',
  estructura: 'estructura y configuración',
  metricas: 'métricas diarias',
  historico: 'histórico',
  cambios: 'historial de cambios',
  latido: 'latido horario',
  landing: 'páginas de destino'
};
/** Horario en que se pide el latido (hora local de la cuenta). */
export const SERVICE_HOURS = { from: 7, to: 23 };

export type SourceHealth = 'sana' | 'atrasada' | 'caida' | 'sin_datos';

export function sourceHealth(
  state: { source: string; lastOkAt: Date | null; consecutiveFailures: number; expectedEveryMinutes?: number } | null,
  at: Date,
  opts: { localHour?: number } = {}
): { health: SourceHealth; critical: boolean; ageMinutes: number | null } {
  if (!state) return { health: 'sin_datos', critical: false, ageMinutes: null };
  const expected = state.expectedEveryMinutes || EXPECTED_MINUTES[state.source as AdsSource] || 360;
  if (!state.lastOkAt) return { health: state.consecutiveFailures > 0 ? 'caida' : 'sin_datos', critical: false, ageMinutes: null };
  const age = Math.max(0, Math.round((at.getTime() - state.lastOkAt.getTime()) / 60_000));
  // «cambios» más de 7 días atrasada es crítica: pasados 30 días lo perdido no vuelve (R5 I6).
  const critical = state.source === 'cambios' && age > 7 * 1440;
  if (state.consecutiveFailures >= 3) return { health: 'caida', critical, ageMinutes: age };
  // El latido solo se pide en horario de servicio: fuera de él, basta con que haya funcionado en las últimas 12 h.
  let limit = expected * 2;
  if (state.source === 'latido' && opts.localHour !== undefined && (opts.localHour < SERVICE_HOURS.from + 2 || opts.localHour >= SERVICE_HOURS.to)) limit = 12 * 60;
  if (state.source === 'historico') return { health: 'sana', critical, ageMinutes: age };
  if (age > limit) return { health: state.consecutiveFailures > 0 ? 'caida' : 'atrasada', critical, ageMinutes: age };
  return { health: 'sana', critical, ageMinutes: age };
}

/** Fuentes de las que depende la vigilancia diaria de una cuenta (la cabecera de cobertura del paso 1). */
export const CORE_SOURCES: AdsSource[] = ['estructura', 'metricas', 'cambios', 'latido'];

// --- Autores del historial de cambios (PRO-08) ------------------------------------------------------------------------

export type ActorClass = 'agencia' | 'cliente' | 'google' | 'herramienta' | 'desconocido';

/**
 * Quién hizo un cambio. `client_type` se guarda tal cual; aquí solo se clasifica [valores por comprobar en v26]:
 * recomendaciones aplicadas solas o herramientas internas de Google → google; reglas, scripts, API y SA360 → herramienta;
 * con correo, agencia si es de sus dominios o de su lista de personas (hay quien usa su gmail), si no, cliente.
 */
export function classifyActor(email: string | null | undefined, clientType: string | null | undefined, agency: { domains: string[]; emails: string[] }): ActorClass {
  const ct = String(clientType ?? '').toUpperCase();
  if (/RECOMMENDATIONS_SUBSCRIPTION|INTERNAL_TOOL/.test(ct)) return 'google';
  if (/AUTOMATED_RULE|SCRIPTS|GOOGLE_ADS_API|SEARCH_ADS_360/.test(ct)) return 'herramienta';
  const e = String(email ?? '').trim().toLowerCase();
  if (!e || !e.includes('@')) return ct ? 'google' : 'desconocido';
  if (agency.emails.map((x) => x.toLowerCase()).includes(e)) return 'agencia';
  const domain = e.split('@')[1];
  if (agency.domains.map((x) => x.toLowerCase().replace(/^@/, '')).some((d) => domain === d || domain.endsWith(`.${d}`))) return 'agencia';
  return 'cliente';
}

// --- URL de destino ---------------------------------------------------------------------------------------------------

const TRACKING = /^(utm_\w+|gclid|gbraid|wbraid|gad_source|gad_campaignid|fbclid|msclkid|_ga|_gl)$/i;

/** URL normalizada para agrupar: sin fragmento, sin parámetros de seguimiento, host en minúsculas, sin «/» final. */
export function normalizeLandingUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of keep) u.searchParams.append(k, v);
    const pathname = u.pathname.length > 1 && u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname;
    return `${u.protocol}//${u.host.toLowerCase()}${pathname}${u.search}`.slice(0, 2000);
  } catch {
    return null;
  }
}

// --- Versiones de configuración ---------------------------------------------------------------------------------------

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]));
  return v;
}
export function snapshotHash(snapshot: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(snapshot))).digest('hex');
}

// --- Clave de la cuenta de servicio (R5 menor 8) ----------------------------------------------------------------------

export type ServiceAccountKey = { clientEmail: string; privateKey: string; privateKeyId: string; tokenUri: string; projectId: string | null };

export function parseServiceAccountKey(text: string): { ok: true; key: ServiceAccountKey } | { ok: false; error: string } {
  const raw = String(text ?? '').trim();
  if (!raw) return { ok: false, error: 'Pega el contenido del archivo JSON de la cuenta de servicio.' };
  if (raw.length > 10_000) return { ok: false, error: 'El texto es demasiado largo para ser una clave de cuenta de servicio.' };
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'No es un JSON válido: pega el archivo entero, desde la primera { hasta la última }.' };
  }
  if (j.type !== 'service_account') return { ok: false, error: 'Ese JSON no es de una cuenta de servicio (falta "type": "service_account").' };
  const clientEmail = typeof j.client_email === 'string' ? j.client_email.trim() : '';
  const privateKey = typeof j.private_key === 'string' ? j.private_key : '';
  const privateKeyId = typeof j.private_key_id === 'string' ? j.private_key_id.trim() : '';
  const tokenUri = typeof j.token_uri === 'string' ? j.token_uri.trim() : '';
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(clientEmail)) return { ok: false, error: 'Falta el correo de la cuenta de servicio (client_email).' };
  if (!/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(privateKey)) return { ok: false, error: 'Falta la clave privada (private_key).' };
  if (!privateKeyId) return { ok: false, error: 'Falta el identificador de la clave (private_key_id).' };
  if (!/^https:\/\/oauth2\.googleapis\.com\//.test(tokenUri)) return { ok: false, error: 'La dirección del token (token_uri) no es la de Google.' };
  return { ok: true, key: { clientEmail, privateKey, privateKeyId, tokenUri, projectId: typeof j.project_id === 'string' ? j.project_id : null } };
}

/** Lo único que se enseña de la clave: el correo enmascarado y el principio del id de la clave. */
export function keyHint(key: ServiceAccountKey, mask: (v: string) => string | null): string {
  return `${mask(key.clientEmail) ?? '…'} · clave ${key.privateKeyId.slice(0, 6)}…`;
}

// --- Cupo -------------------------------------------------------------------------------------------------------------

/** «5s», «1.5s» o {seconds} (retryDelay de Google) → milisegundos, con tope de 60 s. */
export function retryDelayMs(v: unknown): number | null {
  if (typeof v === 'string') {
    const m = v.match(/^(\d+(?:\.\d+)?)s$/);
    return m ? Math.min(60_000, Math.round(Number(m[1]) * 1000)) : null;
  }
  if (v && typeof v === 'object' && 'seconds' in v) return Math.min(60_000, Number((v as { seconds: unknown }).seconds) * 1000 || 0) || null;
  return null;
}
