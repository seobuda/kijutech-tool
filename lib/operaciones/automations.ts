// Panel de Automatizaciones (paso 6E): registro de todas las automatizaciones de Operaciones, con sus
// valores por defecto (los que antes estaban fijos en el código), validación, lectura y guardado.
// En la base de datos (ops_automations) solo se guarda lo que el usuario cambia; el resto son estos valores.
// Los cambios quedan en ops_automation_changes. Las funciones que envían avisos leen siempre de aquí.
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsAutomationChanges, opsAutomations, opsClickupWatch, users } from '@/lib/db/schema';

export type FieldDef = {
  key: string;
  label: string;
  type: 'number' | 'times' | 'time' | 'bool';
  unit?: string;
  min?: number;
  max?: number;
  default: number | string | boolean;
  help?: string;
};

export type PlaceholderDef = {
  name: string;
  label: string;
  sample: string; // ya escapado (HTML)
  optional?: boolean; // si está vacío, desaparece la línea que lo contiene
  required?: boolean;
};

export type AutomationDef = {
  key: string;
  title: string;
  what: string; // qué hace y cuándo, en una frase
  fields: FieldDef[];
  canDisable: boolean;
  template?: { default: string; placeholders: PlaceholderDef[] };
  link?: { href: string; label: string };
  testNote?: string; // qué manda «Enviarme una prueba» cuando no hay texto editable
};

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: 'new_request',
    title: 'Aviso de encargo nuevo',
    what: 'Cuando se crea un encargo (o llega uno desde ClickUp), avisa por Telegram a su responsable con los botones del flujo.',
    canDisable: true,
    fields: [],
    template: {
      default:
        '📌 <b>Nuevo encargo</b>{etiqueta}\n<b>{tarea}</b>\n📂 Lista: {lista}\n📅 Entrega: <b>{fecha}</b>\n👤 Cliente: {cliente}\n\n{resumen}\n\n🔗 <a href="{url}">Abrir la tarea en ClickUp</a>',
      placeholders: [
        { name: 'tarea', label: 'Título del encargo', sample: 'Revisar la home de RF Serveis', required: true },
        { name: 'lista', label: 'Lista de ClickUp', sample: 'Web · RF Serveis' },
        { name: 'fecha', label: 'Fecha de entrega', sample: 'vie, 31 oct', optional: true },
        { name: 'cliente', label: 'Cliente', sample: 'RF Serveis', optional: true },
        { name: 'resumen', label: 'Resumen del resultado esperado', sample: 'La home carga rápido y el título es claro.', optional: true },
        { name: 'url', label: 'Enlace a la tarea', sample: 'https://app.clickup.com/t/ejemplo', optional: true },
        { name: 'etiqueta', label: 'Etiqueta (p. ej. «reasignado»), ya con formato', sample: '', }
      ]
    }
  },
  {
    key: 'reminder_unanswered',
    title: 'Recordatorio sin respuesta',
    what: 'Si nadie pulsa ningún botón de un encargo en un tiempo de jornada laboral de su responsable, le manda un único recordatorio.',
    canDisable: true,
    fields: [{ key: 'minutes', label: 'Tiempo sin respuesta', type: 'number', unit: 'min laborables', min: 15, max: 480, default: 120 }],
    template: {
      default: '⏰ <b>Recordatorio</b>: este encargo sigue sin empezar.\n<b>{tarea}</b>\n📅 Entrega: <b>{fecha}</b>\n🔗 <a href="{url}">Abrir la tarea en ClickUp</a>',
      placeholders: [
        { name: 'nombre', label: 'Nombre de la persona', sample: 'Mayelin' },
        { name: 'tarea', label: 'Título del encargo', sample: 'Revisar la home de RF Serveis', required: true },
        { name: 'fecha', label: 'Fecha de entrega', sample: '2026-10-31', optional: true },
        { name: 'cliente', label: 'Cliente', sample: 'RF Serveis', optional: true },
        { name: 'url', label: 'Enlace a la tarea', sample: 'https://app.clickup.com/t/ejemplo', optional: true }
      ]
    }
  },
  {
    key: 'reminder_later',
    title: 'Recordatorio tras «Más tarde»',
    what: 'Si alguien pulsó «Más tarde», el encargo vence hoy y a mitad de su jornada sigue sin empezar, le manda un recordatorio.',
    canDisable: true,
    fields: [{ key: 'dayPct', label: 'Punto de la jornada', type: 'number', unit: '% de la jornada', min: 10, max: 90, default: 50, help: '50 = a mitad de la jornada de esa persona' }],
    template: {
      default: '⏰ <b>Recordatorio</b>: este encargo sigue sin empezar y vence hoy.\n<b>{tarea}</b>\n📅 Entrega: <b>{fecha}</b>\n🔗 <a href="{url}">Abrir la tarea en ClickUp</a>',
      placeholders: [
        { name: 'nombre', label: 'Nombre de la persona', sample: 'Mayelin' },
        { name: 'tarea', label: 'Título del encargo', sample: 'Revisar la home de RF Serveis', required: true },
        { name: 'fecha', label: 'Fecha de entrega', sample: '2026-10-30', optional: true },
        { name: 'cliente', label: 'Cliente', sample: 'RF Serveis', optional: true },
        { name: 'url', label: 'Enlace a la tarea', sample: 'https://app.clickup.com/t/ejemplo', optional: true }
      ]
    }
  },
  {
    key: 'daily_team',
    title: 'Resumen diario del equipo',
    what: 'Cada día laborable, a la hora de entrada de cada persona, le manda sus tareas vencidas y de hoy (si no tiene ninguna, no manda nada).',
    canDisable: true,
    link: { href: '/dashboard/operaciones/equipo', label: 'La hora de entrada y los días se editan en la ficha de Equipo' },
    fields: [{ key: 'windowMin', label: 'Margen si el servidor estaba apagado', type: 'number', unit: 'min', min: 30, max: 360, default: 180, help: 'Pasado este margen, ese día ya no se envía' }],
    template: {
      default: '☀️ <b>Buenos días, {nombre}</b>\n\n{vencidas}\n\n{hoy}',
      placeholders: [
        { name: 'nombre', label: 'Nombre de la persona', sample: 'Mayelin', required: true },
        { name: 'vencidas', label: 'Lista de tareas vencidas (con su título)', sample: '<b>⚠️ Vencidas (1)</b>\n• Revisar la home <i>(Web · 29 oct)</i>', optional: true },
        { name: 'hoy', label: 'Lista de tareas de hoy (con su título)', sample: '<b>📅 Para hoy (2)</b>\n• Publicar el artículo <i>(Blog · hoy)</i>\n• Enviar el informe <i>(SEO · hoy)</i>', optional: true },
        { name: 'fecha', label: 'Fecha de hoy', sample: 'jue, 30 oct' }
      ]
    }
  },
  {
    key: 'digest',
    title: 'Resúmenes de mi bandeja',
    what: 'A las horas indicadas (lunes a viernes) te manda lo completado, lo que ha resuelto el agente solo y lo que necesita de ti.',
    canDisable: true,
    link: { href: '/dashboard/operaciones/equipo', label: 'Tu zona horaria sale de tu ficha de Equipo' },
    fields: [
      { key: 'times', label: 'Horas de envío', type: 'times', default: '13:00,18:00', help: 'Formato HH:MM separadas por coma (máximo 4). Las alertas de clientes van en el último.' },
      { key: 'windowMin', label: 'Margen si el servidor estaba apagado', type: 'number', unit: 'min', min: 30, max: 360, default: 180 },
      { key: 'includeUnanswered', label: 'Incluir «Sin respuesta»', type: 'bool', default: true, help: 'Encargos recordados que siguen sin empezar al terminar la jornada' }
    ],
    template: {
      default: '📋 <b>Resumen</b>\n\n{secciones}',
      placeholders: [
        {
          name: 'secciones',
          label: 'Secciones del resumen (completado, agente, sin respuesta, clientes, necesita de ti)',
          sample: '✅ <b>Completado (1)</b>\n• Revisar la home <i>(Mayelin)</i>\n\n🙋 <b>Necesita de ti (1)</b>\n• 👀 revisión: Enviar el informe <i>(espera 2 h)</i>',
          required: true
        }
      ]
    }
  },
  {
    key: 'client_alerts',
    title: 'Alertas de clientes',
    what: 'En el último resumen del día añade «Clientes en alerta» (sin actividad o sin trabajo planificado); si siguen, lo recuerda cada cierto tiempo.',
    canDisable: true,
    link: { href: '/dashboard/operaciones/clientes', label: 'Los umbrales por nivel y por cliente se editan en Clientes' },
    fields: [{ key: 'remindDays', label: 'Recordar mientras sigan en alerta', type: 'number', unit: 'días', min: 1, max: 30, default: 7 }],
    template: {
      default: '📉 <b>Clientes en alerta ({total})</b>\n{lista}',
      placeholders: [
        { name: 'total', label: 'Número de clientes en alerta', sample: '2', required: true },
        { name: 'lista', label: 'Lista de clientes con su motivo', sample: '• 🔴 <b>san bernardo</b>: sin actividad en más de 62 días\n• 🟠 <b>CentrosDym.com</b>: sin trabajo planificado en 14 días', required: true }
      ]
    }
  },
  {
    key: 'activity_scan',
    title: 'Pasada diaria de actividad',
    what: 'De madrugada calcula, con una consulta agrupada a ClickUp, la actividad de cada cliente para el semáforo y las alertas.',
    canDisable: true,
    fields: [
      { key: 'time', label: 'Hora de la pasada (hora de Madrid)', type: 'time', default: '03:00' },
      { key: 'retryMin', label: 'Reintento si falla', type: 'number', unit: 'min', min: 5, max: 240, default: 30 }
    ],
    testNote: 'No envía mensajes por sí misma: la prueba te confirma su estado y su configuración.'
  },
  {
    key: 'watch',
    title: 'Vigilancia de ClickUp',
    what: 'Cada pocos minutos mira ClickUp: tareas nuevas o asignadas entran como encargos, los cierres los completan y las reasignaciones avisan al nuevo.',
    canDisable: true,
    fields: [{ key: 'everySec', label: 'Cada cuánto consulta', type: 'number', unit: 's', min: 60, max: 900, default: 150, help: 'Una consulta agrupada cada vez (límite de ClickUp: 100 por minuto)' }],
    testNote: 'No envía mensajes por sí misma: la prueba te confirma su estado y su configuración.'
  },
  {
    key: 'cleanup',
    title: 'Limpieza de vencidas',
    what: 'A petición tuya (botón en Equipo o aquí), el bot envía a cada persona sus tareas vencidas de una en una para cerrarlas, reprogramarlas o descartarlas. El resumen de cada limpieza va en tus resúmenes.',
    canDisable: true,
    link: { href: '/dashboard/operaciones/equipo', label: 'Se lanza desde Equipo (a una persona o a todas)' },
    fields: [{ key: 'maxTasks', label: 'Tareas por tanda', type: 'number', unit: 'tareas', min: 5, max: 100, default: 30, help: 'Si hay más, las más antiguas van primero y puedes lanzar otra tanda después' }],
    template: {
      default: '🧹 <b>Limpieza de vencidas</b>\nHola {nombre}, vamos a revisar <b>{total}</b> tareas vencidas, de una en una: ciérrala, ponle una fecha nueva o descártala.',
      placeholders: [
        { name: 'nombre', label: 'Nombre de la persona', sample: 'Mayelin', required: true },
        { name: 'total', label: 'Número de tareas de esta tanda', sample: '10', required: true }
      ]
    },
    testNote: 'La prueba te muestra el texto de introducción; las limpiezas reales se lanzan desde Equipo.'
  },
  {
    key: 'startup',
    title: 'Aviso «Sistema en marcha»',
    what: 'Al arrancar el sistema te avisa por Telegram y, si estuvo apagado en horario laboral del equipo, te dice cuánto tiempo y qué quedó pendiente.',
    canDisable: true,
    fields: [{ key: 'minDownMin', label: 'Contar como apagado a partir de', type: 'number', unit: 'min', min: 1, max: 120, default: 3, help: 'Un reinicio más corto no se considera interrupción' }],
    testNote: 'Te envía el aviso de arranque con el estado actual de la cola.'
  },
  {
    key: 'urgent_block',
    title: 'Aviso urgente de bloqueo',
    what: 'Cuando alguien queda bloqueado en un encargo urgente (prioridad 1) y su pregunta llega a ti, te avisa al instante; lo no urgente va al resumen.',
    canDisable: true,
    fields: [],
    template: {
      default: '🔴 <b>URGENTE</b>\n{detalle}',
      placeholders: [{ name: 'detalle', label: 'Datos del bloqueo (tarea, persona y pregunta)', sample: '🚫 <b>Revisar la home</b>\nMayelin pregunta: ¿qué texto uso en el título?', required: true }]
    }
  },
  {
    key: 'urgent_review',
    title: 'Aviso urgente de revisión',
    what: 'Cuando alguien te pide revisar un encargo urgente (prioridad 1), te avisa al instante; lo no urgente va al resumen.',
    canDisable: true,
    fields: [],
    template: {
      default: '🔴 <b>URGENTE</b>\n{detalle}',
      placeholders: [{ name: 'detalle', label: 'Datos de la revisión (tarea, persona y nota)', sample: '👀 <b>Enviar el informe</b>\nMayelin lo da por hecho y pide tu revisión.', required: true }]
    }
  },
  {
    key: 'delivery',
    title: 'Envío y respuestas por Telegram',
    what: 'Reintenta los avisos que fallan y da un tiempo para contestar cuando el bot te pide una nota o una respuesta.',
    canDisable: false,
    fields: [
      { key: 'maxAttempts', label: 'Intentos máximos por aviso', type: 'number', min: 1, max: 10, default: 6 },
      { key: 'pendingMinutes', label: 'Tiempo para contestar al bot', type: 'number', unit: 'min', min: 5, max: 240, default: 30 }
    ],
    testNote: 'Mensaje de prueba sencillo para comprobar que el bot te llega.'
  }
];

export const DEF = new Map(AUTOMATIONS.map((d) => [d.key, d]));

// ---------------------------------------------------------------------------
// Textos con huecos
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set(['b', 'i', 'u', 'code', 'a']);

export function validateTemplate(def: AutomationDef, tpl: string): string | null {
  if (!def.template) return 'Esta automatización no tiene texto editable';
  const text = tpl.trim();
  if (!text) return 'El texto no puede estar vacío';
  if (text.length > 2000) return 'El texto es demasiado largo (máximo 2000 caracteres)';
  const known = new Set(def.template.placeholders.map((p) => p.name));
  const used = new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
  for (const u of used) if (!known.has(u)) return `El hueco {${u}} no existe. Disponibles: ${[...known].map((k) => `{${k}}`).join(', ')}`;
  for (const p of def.template.placeholders) if (p.required && !used.has(p.name)) return `Falta el hueco obligatorio {${p.name}}`;
  // Telegram solo admite unas pocas etiquetas: se comprueba que estén bien cerradas.
  const stack: string[] = [];
  for (const m of text.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const [, close, tag, attrs] = m;
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return `La etiqueta <${tag}> no está permitida (solo b, i, u, code y a)`;
    if (close) {
      if (stack.pop() !== name) return `La etiqueta </${tag}> no está bien cerrada`;
    } else {
      if (name === 'a' && !/^\s+href="(\{url\}|https?:\/\/[^"]+)"\s*$/.test(attrs)) return 'Un enlace debe ser <a href="{url}">texto</a> o llevar una dirección http(s)';
      if (name !== 'a' && attrs.trim()) return `La etiqueta <${tag}> no admite atributos`;
      stack.push(name);
    }
  }
  if (stack.length) return `Falta cerrar la etiqueta <${stack.at(-1)}>`;
  if (/<(?!\/?(b|i|u|code|a)\b)/i.test(text)) return 'Hay un «<» suelto: escríbelo como &lt;';
  return null;
}

// Rellena los huecos. Los valores deben venir ya escapados. Una línea con un hueco opcional vacío desaparece.
export function renderTemplate(def: AutomationDef, tpl: string, values: Record<string, string>): string {
  const optional = new Set((def.template?.placeholders ?? []).filter((p) => p.optional).map((p) => p.name));
  const lines = tpl.split('\n').filter((line) => {
    const names = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return !names.some((n) => optional.has(n) && !(values[n] ?? '').trim());
  });
  return lines
    .join('\n')
    .replace(/\{(\w+)\}/g, (_, n: string) => values[n] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sampleValues(def: AutomationDef): Record<string, string> {
  return Object.fromEntries((def.template?.placeholders ?? []).map((p) => [p.name, p.sample]));
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export type AutoState = {
  key: string;
  enabled: boolean;
  cfg: Record<string, number | string | boolean>;
  template: string; // texto vigente (el personalizado o el de por defecto)
  customTemplate: boolean;
  changedFields: string[]; // campos que se apartan del valor por defecto
};

const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; data: Record<string, AutoState> }>();

export function invalidateAutomations(tenantId: string) {
  cache.delete(tenantId);
}

export async function getAutoAll(tenantId: string): Promise<Record<string, AutoState>> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const rows = await db.select().from(opsAutomations).where(eq(opsAutomations.tenantId, tenantId));
  const [watch] = await db.select().from(opsClickupWatch).where(eq(opsClickupWatch.tenantId, tenantId)).limit(1);
  const out: Record<string, AutoState> = {};
  for (const def of AUTOMATIONS) {
    const row = rows.find((r) => r.key === def.key);
    const saved = (row?.config ?? {}) as Record<string, unknown>;
    const cfg: AutoState['cfg'] = {};
    const changed: string[] = [];
    for (const f of def.fields) {
      const v = saved[f.key];
      const ok = v !== undefined && v !== null && typeof v === typeof f.default;
      cfg[f.key] = ok ? (v as number | string | boolean) : f.default;
      if (ok && v !== f.default) changed.push(f.key);
    }
    const custom = Boolean(row?.template);
    out[def.key] = {
      key: def.key,
      enabled: def.key === 'watch' ? Boolean(watch?.enabled) : (row?.enabled ?? true),
      cfg,
      template: row?.template ?? def.template?.default ?? '',
      customTemplate: custom,
      changedFields: changed
    };
  }
  cache.set(tenantId, { at: Date.now(), data: out });
  return out;
}

export async function getAuto(tenantId: string, key: string): Promise<AutoState> {
  return (await getAutoAll(tenantId))[key];
}

export const num = (a: AutoState, k: string) => Number(a.cfg[k]);

// ---------------------------------------------------------------------------
// Guardado con validación y registro de cambios
// ---------------------------------------------------------------------------

export function validateField(f: FieldDef, raw: unknown): { ok: true; value: number | string | boolean } | { ok: false; error: string } {
  if (f.type === 'bool') return { ok: true, value: Boolean(raw) };
  if (f.type === 'number') {
    const n = Number(raw);
    if (!Number.isInteger(n)) return { ok: false, error: `${f.label}: debe ser un número entero` };
    if (n < (f.min ?? -Infinity) || n > (f.max ?? Infinity)) return { ok: false, error: `${f.label}: debe estar entre ${f.min} y ${f.max}${f.unit ? ` ${f.unit}` : ''}` };
    return { ok: true, value: n };
  }
  const hhmm = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (f.type === 'time') {
    const s = String(raw).trim();
    if (!hhmm.test(s)) return { ok: false, error: `${f.label}: usa el formato HH:MM` };
    return { ok: true, value: s.padStart(5, '0') };
  }
  const list = String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length < 1 || list.length > 4 || list.some((s) => !hhmm.test(s))) return { ok: false, error: `${f.label}: de 1 a 4 horas en formato HH:MM separadas por coma` };
  return { ok: true, value: [...new Set(list.map((s) => s.padStart(5, '0')))].sort().join(',') };
}

const show = (v: unknown) => (v === null || v === undefined ? null : String(v));

export type SaveInput = { enabled?: boolean; config?: Record<string, unknown>; template?: string | null };

export async function saveAutomation(
  tenantId: string,
  userId: number,
  key: string,
  input: SaveInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const def = DEF.get(key);
  if (!def) return { ok: false, error: 'Automatización desconocida' };
  const current = (await getAutoAll(tenantId))[key];
  const [row] = await db.select().from(opsAutomations).where(and(eq(opsAutomations.tenantId, tenantId), eq(opsAutomations.key, key))).limit(1);
  const savedCfg = { ...((row?.config ?? {}) as Record<string, unknown>) };
  const log: { field: string; old: string | null; neu: string | null }[] = [];

  let enabled = row?.enabled ?? null;
  if (input.enabled !== undefined && key !== 'watch') {
    if (!def.canDisable && !input.enabled) return { ok: false, error: 'Esta automatización no se puede apagar' };
    if (input.enabled !== current.enabled) log.push({ field: 'enabled', old: current.enabled ? 'encendida' : 'apagada', neu: input.enabled ? 'encendida' : 'apagada' });
    enabled = input.enabled === true ? null : false;
  }
  if (input.config) {
    for (const f of def.fields) {
      if (!(f.key in input.config)) continue;
      const v = validateField(f, input.config[f.key]);
      if (!v.ok) return v;
      if (v.value !== current.cfg[f.key]) log.push({ field: `config.${f.key}`, old: show(current.cfg[f.key]), neu: show(v.value) });
      if (v.value === f.default) delete savedCfg[f.key];
      else savedCfg[f.key] = v.value;
    }
  }
  let template = row?.template ?? null;
  if (input.template !== undefined) {
    const next = input.template === null || input.template.trim() === (def.template?.default ?? '').trim() ? null : input.template.trim();
    if (next !== null) {
      const err = validateTemplate(def, next);
      if (err) return { ok: false, error: err };
    }
    if ((next ?? def.template?.default) !== current.template) log.push({ field: 'template', old: current.template, neu: next ?? '(texto por defecto)' });
    template = next;
  }
  if (log.length === 0) return { ok: true };

  await db
    .insert(opsAutomations)
    .values({ tenantId, key, enabled, config: savedCfg, template, updatedBy: userId })
    .onConflictDoUpdate({
      target: [opsAutomations.tenantId, opsAutomations.key],
      set: { enabled, config: savedCfg, template, updatedBy: userId, updatedAt: new Date() }
    });
  await db.insert(opsAutomationChanges).values(log.map((l) => ({ tenantId, automationKey: key, field: l.field, oldValue: l.old, newValue: l.neu, changedBy: userId })));
  invalidateAutomations(tenantId);
  return { ok: true };
}

export async function resetAutomation(tenantId: string, userId: number, key: string) {
  const [row] = await db.select().from(opsAutomations).where(and(eq(opsAutomations.tenantId, tenantId), eq(opsAutomations.key, key))).limit(1);
  if (!row) return;
  await db.delete(opsAutomations).where(eq(opsAutomations.id, row.id));
  await db.insert(opsAutomationChanges).values({ tenantId, automationKey: key, field: 'reset', oldValue: 'valores personalizados', newValue: 'valores por defecto', changedBy: userId });
  invalidateAutomations(tenantId);
}

export async function logAutomationChange(tenantId: string, userId: number, key: string, field: string, oldValue: string | null, newValue: string | null) {
  await db.insert(opsAutomationChanges).values({ tenantId, automationKey: key, field, oldValue, newValue, changedBy: userId });
}

export async function listChanges(tenantId: string, limit = 100) {
  const rows = await db
    .select({
      id: opsAutomationChanges.id,
      key: opsAutomationChanges.automationKey,
      field: opsAutomationChanges.field,
      oldValue: opsAutomationChanges.oldValue,
      newValue: opsAutomationChanges.newValue,
      at: opsAutomationChanges.changedAt,
      who: users.name,
      email: users.email
    })
    .from(opsAutomationChanges)
    .leftJoin(users, eq(users.id, opsAutomationChanges.changedBy))
    .where(eq(opsAutomationChanges.tenantId, tenantId))
    .orderBy(desc(opsAutomationChanges.changedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, at: r.at.getTime(), who: r.who || r.email || 'Sistema' }));
}
