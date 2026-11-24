// SEO · Correo de 3 preguntas: reglas PURAS (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §4). Sin IA para elegir.
//   1. Candidatas sobre el expediente: un dato que falta, que dos fuentes dan distinto o del que nos fiamos poco.
//      Lo que una persona ya confirmó no se pregunta.
//   2. Se eligen las 3 que más pesan: identidad (nombre, web) > nombre, dirección y teléfono > servicios > zona.
//   3. El texto lo pone una plantilla. Los campos preguntados viajan en la clave del mensaje (para leer la respuesta).
//   4. La respuesta la lee la IA (Haiku) y aquí se limpia: cada dato debe venir con una cita que esté en el correo.
import { display, factKey, normPhone, normText, sameName, type Address, type FactSource } from '@/lib/seo/expediente/rules';

export const QUESTION_FIELDS = ['nombre', 'web', 'telefono', 'direccion', 'servicios', 'zona'] as const;
export type QuestionField = (typeof QUESTION_FIELDS)[number];
const FIELD_SET = new Set<string>(QUESTION_FIELDS);

export const MAX_QUESTIONS = 3;
/** Como mucho un correo de preguntas por proyecto en este plazo (también si se descartó: no insistir). */
export const COOLDOWN_DAYS = 30;
/** Por debajo de esta confianza, un dato que solo da una fuente se pregunta. */
export const LOW_CONFIDENCE = 60;

const LABEL: Record<QuestionField, string> = {
  nombre: 'el nombre comercial',
  web: 'la web',
  telefono: 'el teléfono',
  direccion: 'la dirección',
  servicios: 'la lista de servicios',
  zona: 'la zona de trabajo'
};

const MISSING_TEXT: Partial<Record<QuestionField, string>> = {
  telefono: '¿Qué teléfono queréis que aparezca en Google y en la web?',
  direccion: '¿Cuál es la dirección del negocio (calle, número, código postal y población)? Si no tenéis local abierto al público, decídnoslo.',
  servicios: '¿Qué servicios o productos son los más importantes para vosotros? Una lista corta, de más a menos importante, nos basta.',
  zona: '¿En qué poblaciones o zonas trabajáis o queréis conseguir clientes?'
};

export type FactForQuestions = { field: string; value: unknown; source: FactSource; status: string; confidence: number };
export type Question = { field: QuestionField; reason: 'falta' | 'conflicto' | 'dudoso'; text: string };

const sameValue = (field: string, a: unknown, b: unknown) => (field === 'nombre' ? sameName(a, b) : factKey(field, a) !== null && factKey(field, a) === factKey(field, b));

/** Candidatas, ya en orden de peso (una por campo como mucho). */
export function questionCandidates(facts: FactForQuestions[]): Question[] {
  const out: Question[] = [];
  for (const field of QUESTION_FIELDS) {
    const live = facts.filter((f) => f.field === field && f.status !== 'descartado');
    if (live.some((f) => f.status === 'confirmado')) continue;
    // Valores distintos (el primero de cada grupo de iguales).
    const distinct: FactForQuestions[] = [];
    for (const f of live) if (factKey(field, f.value) !== null && !distinct.some((d) => sameValue(field, d.value, f.value))) distinct.push(f);
    if (distinct.length >= 2) {
      const opts = distinct.slice(0, 3).map((f) => `«${display(field, f.value)}»`);
      out.push({ field, reason: 'conflicto', text: `Nos aparecen datos distintos para ${LABEL[field]}: ${opts.join(' y ')}. ¿Cuál es el bueno? (Si no es ninguno, decidnos el correcto.)` });
      continue;
    }
    if (!live.length) {
      const t = MISSING_TEXT[field];
      if (t) out.push({ field, reason: 'falta', text: t });
      continue;
    }
    const best = [...live].sort((a, b) => b.confidence - a.confidence)[0];
    if (best.confidence < LOW_CONFIDENCE && best.source !== 'cliente') {
      out.push({ field, reason: 'dudoso', text: `¿Nos confirmáis que ${LABEL[field]} es «${display(field, best.value)}»? Si no, decidnos el correcto.` });
    }
  }
  // Mismo peso que el orden de campos; los conflictos de identidad van siempre primero.
  return out;
}

export function pickQuestions(cands: Question[], max = MAX_QUESTIONS): Question[] {
  return cands.slice(0, max);
}

// --- Correo -------------------------------------------------------------------------------------------------------

export function questionsEmail(input: { businessName: string; questions: Question[] }): { subject: string; body: string } {
  const n = input.questions.length;
  const subject = `${n === 1 ? 'Una pregunta rápida' : `${n} preguntas rápidas`} sobre ${input.businessName}`.slice(0, 300);
  const body = [
    'Hola:',
    '',
    `Estamos revisando cómo aparece ${input.businessName} en Google y queremos asegurarnos de que los datos básicos son correctos. ¿Nos ${n === 1 ? 'respondéis a esta pregunta' : `respondéis a estas ${n} preguntas`}? Basta con contestar a este correo, aunque sea con una línea por pregunta.`,
    '',
    ...input.questions.map((q, i) => `${i + 1}. ${q.text}`),
    '',
    '¡Muchas gracias!',
    'Equipo Kijutech'
  ].join('\n');
  return { subject, body };
}

/** Clave del mensaje: única por proyecto y día, con los campos preguntados (para leer luego la respuesta). */
export function questionsDedupeKey(projectId: string, day: string, fields: QuestionField[]): string {
  return `preguntas:${projectId}:${day.replace(/-/g, '')}:${fields.join(',')}`.slice(0, 200);
}

export function fieldsFromDedupeKey(key: string | null | undefined): QuestionField[] {
  const m = /^preguntas:[0-9a-f-]{36}:\d{8}:([a-z_,]+)$/.exec(key ?? '');
  if (!m) return [];
  return m[1].split(',').filter((f): f is QuestionField => FIELD_SET.has(f));
}

// --- Respuestas ---------------------------------------------------------------------------------------------------

export type Answer = { field: QuestionField; value: unknown; quote: string };

const squash = (s: string) => normText(s).replace(/\s+/g, ' ').trim();

/** ¿La cita está en el correo? (sin mayúsculas, tildes ni espacios de más). Evita datos inventados. */
export function quoteInText(quote: string, text: string): boolean {
  const q = squash(quote);
  return q.length >= 2 && squash(text).includes(q);
}

/**
 * Limpia lo que devuelve la IA: solo los campos preguntados, con cita presente en el texto y valor con la forma de su
 * campo (teléfono válido, dirección con población o código postal, servicios como lista corta…).
 */
export function cleanAnswers(raw: unknown, asked: QuestionField[], text: string): Answer[] {
  const list = Array.isArray((raw as { respuestas?: unknown })?.respuestas) ? ((raw as { respuestas: unknown[] }).respuestas as Record<string, unknown>[]) : [];
  const out: Answer[] = [];
  for (const r of list) {
    const field = String(r?.campo ?? '') as QuestionField;
    const quote = typeof r?.cita === 'string' ? r.cita.trim().slice(0, 500) : '';
    if (!asked.includes(field) || out.some((a) => a.field === field) || !quote || !quoteInText(quote, text)) continue;
    const v = r.valor;
    let value: unknown = null;
    if (field === 'telefono') value = normPhone(typeof v === 'string' ? v : quote);
    else if (field === 'direccion' && v && typeof v === 'object') {
      const a = v as Record<string, unknown>;
      const s = (k: string) => (typeof a[k] === 'string' && (a[k] as string).trim() ? (a[k] as string).trim().slice(0, 200) : null);
      const addr: Address = { street: s('calle'), postalCode: s('codigo_postal'), city: s('poblacion'), region: s('provincia'), country: 'ES' };
      value = addr.city || addr.postalCode ? addr : null;
    } else if (field === 'servicios') {
      const items = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]/) : []).map((x) => String(x).trim()).filter((x) => x.length >= 2 && x.length <= 80);
      value = items.length ? [...new Set(items)].slice(0, 15) : null;
    } else if (field === 'web') {
      const w = typeof v === 'string' ? v.trim() : '';
      value = /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(w) ? (w.startsWith('http') ? w : `https://${w}`) : null;
    } else value = typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null;
    if (value !== null) out.push({ field, value, quote });
  }
  return out;
}

/** Sin IA disponible: solo lo que se puede leer con seguridad (un teléfono, si se preguntó y hay uno solo). */
export function ruleAnswers(asked: QuestionField[], text: string): Answer[] {
  if (!asked.includes('telefono')) return [];
  const phones = [...new Set((text.match(/(?:\+?34[\s.-]?)?[6-9](?:[\s.-]?\d){8}/g) ?? []).map((p) => normPhone(p)).filter((p): p is string => Boolean(p)))];
  return phones.length === 1 ? [{ field: 'telefono', value: phones[0], quote: (text.match(/(?:\+?34[\s.-]?)?[6-9](?:[\s.-]?\d){8}/) ?? [''])[0] }] : [];
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
