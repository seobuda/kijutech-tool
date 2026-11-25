// Preguntas al cliente: reglas PURAS (25 nov 2026; docs/DISENO-PREGUNTAS-CLIENTE.md). Se prueban sin base de datos.
//   - Tipos de respuesta, destinos (dónde se guarda cada respuesta) y cuándo se pregunta.
//   - Qué preguntas del banco le tocan a un cliente (por sus servicios) y cuáles se vuelven a preguntar.
//   - Cómo se envían (correo corto o cuestionario en línea) y los textos de los correos con sus huecos.
//   - Limpieza de lo que saca la IA de una respuesta por correo: cada dato con su cita literal.

export const ANSWER_TYPES = ['texto', 'lista', 'si_no', 'numero', 'direccion', 'fecha'] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];
export const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  texto: 'Texto',
  lista: 'Lista',
  si_no: 'Sí / no',
  numero: 'Cantidad',
  direccion: 'Dirección',
  fecha: 'Fecha'
};

export const ASK_WHEN = ['alta', 'periodica'] as const;
export type AskWhen = (typeof ASK_WHEN)[number];

export const QUESTION_STATUSES = ['pendiente', 'enviada', 'respondida', 'no_aplica'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** Campos de la ficha del cliente que puede rellenar una respuesta (clave del destino → columna de clients). */
export const FICHA_TARGETS = {
  'ficha.business': { column: 'business', label: 'Ficha: a qué se dedica' },
  'ficha.offerings': { column: 'offerings', label: 'Ficha: qué vende u ofrece' },
  'ficha.audience': { column: 'audience', label: 'Ficha: público' },
  'ficha.area': { column: 'area', label: 'Ficha: zona' },
  'ficha.valueProposition': { column: 'valueProposition', label: 'Ficha: qué le diferencia' },
  'ficha.brandTone': { column: 'brandTone', label: 'Ficha: tono de marca' },
  'ficha.goals': { column: 'goals', label: 'Ficha: objetivos' }
} as const;
export type FichaTarget = keyof typeof FICHA_TARGETS;

export const MEMORY_TARGETS = {
  memoria: { kind: 'contexto', label: 'Memoria: contexto' },
  'memoria.preferencia': { kind: 'preferencia', label: 'Memoria: preferencia' },
  'memoria.restriccion': { kind: 'restriccion', label: 'Memoria: lo que no se quiere' },
  'memoria.decision': { kind: 'decision', label: 'Memoria: decisión' }
} as const;
export type MemoryTarget = keyof typeof MEMORY_TARGETS;

/** Destinos que se pueden elegir en el banco (los de un módulo, como «seo:…», solo los pone su módulo). */
export const BANK_TARGETS = [...Object.keys(MEMORY_TARGETS), ...Object.keys(FICHA_TARGETS)] as (MemoryTarget | FichaTarget)[];
export const TARGET_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MEMORY_TARGETS).map(([k, v]) => [k, v.label])),
  ...Object.fromEntries(Object.entries(FICHA_TARGETS).map(([k, v]) => [k, v.label]))
};
export const isBankTarget = (t: string): t is MemoryTarget | FichaTarget => (BANK_TARGETS as string[]).includes(t);
export const isFichaTarget = (t: string): t is FichaTarget => t in FICHA_TARGETS;
export const isMemoryTarget = (t: string): t is MemoryTarget => t in MEMORY_TARGETS;
/** Destino de un módulo: «<módulo>:<lo que sea>» (lo recibe el manejador que ese módulo registró). */
export const moduleOfTarget = (t: string): string | null => (/^([a-z]+):/.exec(t)?.[1] ?? null);

export const TEXT_MAX = 500;
export const HELP_MAX = 500;
export const ANSWER_MAX = 2000;

export function validateQuestionInput(input: { text: string; help?: string | null; answerType: string; target: string; askWhen: string; repeatDays?: number | null }):
  | { ok: true; value: { text: string; help: string | null; answerType: AnswerType; target: string; askWhen: AskWhen; repeatDays: number | null } }
  | { ok: false; error: string } {
  const text = input.text.replace(/\s+/g, ' ').trim();
  if (text.length < 5) return { ok: false, error: 'Escribe la pregunta' };
  if (text.length > TEXT_MAX) return { ok: false, error: `La pregunta puede tener como mucho ${TEXT_MAX} caracteres` };
  const help = (input.help ?? '').replace(/\s+/g, ' ').trim().slice(0, HELP_MAX) || null;
  if (!(ANSWER_TYPES as readonly string[]).includes(input.answerType)) return { ok: false, error: 'Tipo de respuesta no válido' };
  if (!isBankTarget(input.target)) return { ok: false, error: 'Destino no válido' };
  if (!(ASK_WHEN as readonly string[]).includes(input.askWhen)) return { ok: false, error: 'Cuándo preguntar: no válido' };
  let repeatDays: number | null = null;
  if (input.askWhen === 'periodica') {
    const d = Math.round(Number(input.repeatDays));
    if (!Number.isFinite(d) || d < 7 || d > 730) return { ok: false, error: 'Cada cuántos días: entre 7 y 730' };
    repeatDays = d;
  }
  return { ok: true, value: { text, help, answerType: input.answerType as AnswerType, target: input.target, askWhen: input.askWhen as AskWhen, repeatDays } };
}

// --- Qué le toca a cada cliente ------------------------------------------------------------------------------------

export type TemplateLike = { id: string; serviceKey: string | null; active: boolean; askWhen: string; repeatDays: number | null };
export type RowLike = { templateId: string | null; status: string; answeredAt: Date | null; updatedAt: Date };

/**
 * Preguntas del banco que hay que abrir para un cliente: las activas de General y de sus servicios que no tienen fila
 * abierta, ni se marcaron «no aplica», ni se respondieron (las periódicas sí, cuando pasa su plazo desde la respuesta).
 */
export function templatesToOpen(templates: TemplateLike[], services: string[], rows: RowLike[], now: Date): string[] {
  const svc = new Set(services);
  const out: string[] = [];
  for (const t of templates) {
    if (!t.active || (t.serviceKey !== null && !svc.has(t.serviceKey))) continue;
    const mine = rows.filter((r) => r.templateId === t.id);
    if (mine.some((r) => r.status === 'pendiente' || r.status === 'enviada' || r.status === 'no_aplica')) continue;
    const answered = mine.filter((r) => r.status === 'respondida');
    if (!answered.length) {
      out.push(t.id);
      continue;
    }
    if (t.askWhen !== 'periodica' || !t.repeatDays) continue;
    const last = Math.max(...answered.map((r) => (r.answeredAt ?? r.updatedAt).getTime()));
    if (now.getTime() - last >= t.repeatDays * 86_400_000) out.push(t.id);
  }
  return out;
}

/** Pendientes del banco que ya no tocan (pregunta desactivada o borrada, o servicio que ya no se le hace). */
export function templatesToClose(templates: TemplateLike[], services: string[], rows: (RowLike & { id: string; customText?: boolean })[]): string[] {
  const svc = new Set(services);
  const live = new Set(templates.filter((t) => t.active && (t.serviceKey === null || svc.has(t.serviceKey))).map((t) => t.id));
  return rows.filter((r) => r.status === 'pendiente' && r.templateId !== null && !live.has(r.templateId) && !r.customText).map((r) => r.id);
}

// --- Envío ------------------------------------------------------------------------------------------------------------

/** Hasta aquí, correo corto; con más preguntas, cuestionario en línea (en un correo largo nadie contesta bien). */
export const EMAIL_MAX_QUESTIONS = 5;
export type Delivery = 'correo' | 'cuestionario';
export const suggestedDelivery = (n: number): Delivery => (n > EMAIL_MAX_QUESTIONS ? 'cuestionario' : 'correo');
export const QUESTIONNAIRE_DAYS = 30;
/** Envío automático (tras reunir el expediente): como mucho uno por cliente en este plazo. */
export const AUTO_COOLDOWN_DAYS = 30;

export const COMMS_TEMPLATE_KEYS = ['preguntas_correo', 'preguntas_cuestionario'] as const;
export type CommsTemplateKey = (typeof COMMS_TEMPLATE_KEYS)[number];

export const COMMS_TEMPLATE_INFO: Record<CommsTemplateKey, { title: string; when: string; placeholders: string[] }> = {
  preguntas_correo: {
    title: 'Correo con las preguntas',
    when: `Cuando se envían ${EMAIL_MAX_QUESTIONS} preguntas o menos: el cliente responde al correo.`,
    placeholders: ['{cliente}', '{preguntas}', '{n}', '{servicios}']
  },
  preguntas_cuestionario: {
    title: 'Correo con el enlace al cuestionario',
    when: `Cuando son más de ${EMAIL_MAX_QUESTIONS}: el cliente las responde en una página con un enlace privado.`,
    placeholders: ['{cliente}', '{n}', '{servicios}', '{enlace}', '{caduca}']
  }
};

export const DEFAULT_COMMS_TEMPLATES: Record<CommsTemplateKey, { subject: string; body: string }> = {
  preguntas_correo: {
    subject: 'Unas preguntas rápidas sobre {cliente}',
    body: [
      'Hola:',
      '',
      'Para seguir trabajando bien en {cliente} necesitamos que nos confirméis algunas cosas. Basta con contestar a este correo, aunque sea con una línea por pregunta:',
      '',
      '{preguntas}',
      '',
      '¡Muchas gracias!',
      'Equipo Kijutech'
    ].join('\n')
  },
  preguntas_cuestionario: {
    subject: 'Cuestionario para preparar el trabajo de {cliente}',
    body: [
      'Hola:',
      '',
      'Para preparar bien el trabajo de {servicios} en {cliente} necesitamos conocer algunos detalles. Os hemos preparado un cuestionario de {n} preguntas que podéis rellenar aquí, a vuestro ritmo:',
      '',
      '{enlace}',
      '',
      'Lo que escribáis se guarda solo y podéis volver más tarde con el mismo enlace, que funciona hasta el {caduca}. Si alguna pregunta no aplica, dejadla en blanco.',
      '',
      '¡Muchas gracias!',
      'Equipo Kijutech'
    ].join('\n')
  }
};

/** Rellena los huecos {nombre} de una plantilla (una sola pasada: un valor no puede colar otro hueco). */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export const numberedList = (texts: string[]) => texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

/** El correo del cuestionario debe llevar el enlace: si el texto editado lo perdió, se añade al final. */
export function ensureLink(body: string): string {
  return body.includes('{enlace}') ? body : `${body.trimEnd()}\n\n{enlace}`;
}

export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}

// --- Enlace del cuestionario --------------------------------------------------------------------------------------

// El token y su hash se generan en el servidor (lib/core/questions.ts): aquí solo la forma.
export const looksLikeToken = (t: string) => /^[A-Za-z0-9_-]{32}$/.test(t);

// --- Respuestas ---------------------------------------------------------------------------------------------------

export type CleanValue = { value: unknown; text: string };

/**
 * Normaliza una respuesta según su tipo. Devuelve null si no tiene la forma esperada (vacía, lista sin elementos…).
 * Sirve para lo que escribe el cliente en el cuestionario, lo que apunta una persona y lo que saca la IA de un correo.
 */
export function cleanAnswer(type: string, raw: unknown): CleanValue | null {
  const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
  switch (type) {
    case 'lista': {
      const items = (Array.isArray(raw) ? raw.map(str) : str(raw).split(/[\n;,]/)).map((x) => x.replace(/^[-•*\d.)\s]+/, '').trim()).filter((x) => x.length >= 1 && x.length <= 200);
      const uniq = [...new Set(items)].slice(0, 30);
      return uniq.length ? { value: uniq, text: uniq.join(', ') } : null;
    }
    case 'si_no': {
      if (raw === true) return { value: true, text: 'Sí' };
      if (raw === false) return { value: false, text: 'No' };
      const s = str(raw).slice(0, ANSWER_MAX);
      if (!s) return null;
      // «Sí, …» / «No, …»: se guarda el sí o el no y el texto entero (los matices importan).
      if (/^(s[ií]|yes|true)(?![a-z])/i.test(s)) return { value: true, text: s };
      if (/^(no|false)(?![a-z])/i.test(s)) return { value: false, text: s };
      return { value: null, text: s };
    }
    case 'numero': {
      const s = str(raw);
      if (!s) return null;
      const m = /-?\d[\d.\s]*(?:,\d+)?/.exec(s);
      const n = m ? Number(m[0].replace(/[.\s]/g, '').replace(',', '.')) : NaN;
      return { value: Number.isFinite(n) ? n : null, text: s.slice(0, ANSWER_MAX) };
    }
    case 'direccion': {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const a = raw as Record<string, unknown>;
        const v = { calle: str(a.calle).slice(0, 200), codigo_postal: str(a.codigo_postal).slice(0, 10), poblacion: str(a.poblacion).slice(0, 120), provincia: str(a.provincia).slice(0, 120) };
        const text = [v.calle, [v.codigo_postal, v.poblacion].filter(Boolean).join(' '), v.provincia].filter(Boolean).join(', ');
        return text ? { value: v, text } : null;
      }
      const s = str(raw);
      return s ? { value: { calle: s.slice(0, 200), codigo_postal: '', poblacion: '', provincia: '' }, text: s.slice(0, ANSWER_MAX) } : null;
    }
    case 'fecha':
    case 'texto':
    default: {
      const s = str(raw).slice(0, ANSWER_MAX);
      return s ? { value: s, text: s } : null;
    }
  }
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** ¿La cita está en el correo? (sin mayúsculas, tildes ni espacios de más). Evita respuestas inventadas. */
export function quoteInText(quote: string, text: string): boolean {
  const q = squash(quote);
  return q.length >= 2 && squash(text).includes(q);
}

export type AskedQuestion = { id: string; n: number; type: string };
export type ExtractedAnswer = { id: string; value: unknown; text: string; quote: string };

/** Limpia lo que devuelve la IA al leer un correo: solo preguntas hechas, con cita presente y valor con forma. */
export function cleanExtracted(raw: unknown, asked: AskedQuestion[], text: string): ExtractedAnswer[] {
  const list = Array.isArray((raw as { respuestas?: unknown })?.respuestas) ? ((raw as { respuestas: unknown[] }).respuestas as Record<string, unknown>[]) : [];
  const out: ExtractedAnswer[] = [];
  for (const r of list) {
    const q = asked.find((a) => a.n === Number(r?.n));
    if (!q || out.some((o) => o.id === q.id)) continue;
    const quote = typeof r?.cita === 'string' ? r.cita.trim().slice(0, 1000) : '';
    if (!quote || !quoteInText(quote, text)) continue;
    const v = cleanAnswer(q.type, r.valor);
    if (v) out.push({ id: q.id, value: v.value, text: v.text, quote });
  }
  return out;
}

/**
 * El texto nuevo de una respuesta, sin el correo citado debajo: corta en la primera línea citada («>») o en la cabecera
 * típica de cita («El … escribió:», «On … wrote:», «-----Mensaje original-----», «De: …» con «Enviado:»).
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*>/.test(l)) break;
    if (/^\s*(El|On)\b.{0,200}(escribió|wrote)\s*:?\s*$/i.test(l)) break;
    if (/^\s*-{2,}\s*(Mensaje original|Original Message)/i.test(l)) break;
    if (/^\s*(De|From)\s*:/i.test(l) && /^\s*(Enviado|Sent|Fecha|Date)\s*:/i.test(lines[i + 1] ?? '')) break;
    out.push(l);
  }
  return out.join('\n').trim() || text.trim();
}

// --- Propuestas de la IA ------------------------------------------------------------------------------------------

export type ProposedQuestion = { text: string; help: string | null; answerType: AnswerType; target: string; askWhen: AskWhen; repeatDays: number | null };

/** Limpia la lista de preguntas que propone la IA: forma válida, sin repetir las que ya hay, como mucho 15. */
export function cleanProposals(raw: unknown, existing: string[]): ProposedQuestion[] {
  const list = Array.isArray((raw as { preguntas?: unknown })?.preguntas) ? ((raw as { preguntas: unknown[] }).preguntas as Record<string, unknown>[]) : [];
  const seen = new Set(existing.map(squash));
  const out: ProposedQuestion[] = [];
  for (const p of list) {
    const v = validateQuestionInput({
      text: String(p?.texto ?? ''),
      help: typeof p?.para_que === 'string' ? p.para_que : null,
      answerType: String(p?.tipo ?? 'texto'),
      target: isBankTarget(String(p?.destino ?? '')) ? String(p.destino) : 'memoria',
      askWhen: p?.cada_dias ? 'periodica' : 'alta',
      repeatDays: p?.cada_dias ? Number(p.cada_dias) : null
    });
    if (!v.ok) continue;
    const k = squash(v.value.text);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v.value);
    if (out.length >= 15) break;
  }
  return out;
}
