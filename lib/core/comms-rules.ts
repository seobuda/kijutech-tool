// Comunicaciones con clientes: reglas puras (cimientos, 23 nov 2026). Se prueban sin base de datos.
// Quién recibe cada tipo de mensaje, si un mensaje pasa por aprobación y cómo se identifica su hilo.

export const COMMS_KINDS = ['informes', 'preguntas', 'avisos', 'aprobaciones', 'facturacion'] as const;
export type CommsKind = (typeof COMMS_KINDS)[number];
/** Lo que se puede marcar en un contacto: los tipos y «todo». */
export const SUBSCRIPTION_KINDS = [...COMMS_KINDS, 'todo'] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];

export const COMMS_KIND_LABELS: Record<SubscriptionKind, string> = {
  informes: 'Informes',
  preguntas: 'Preguntas',
  avisos: 'Avisos',
  aprobaciones: 'Aprobaciones',
  facturacion: 'Facturación',
  todo: 'Todo'
};

export type ContactForRouting = {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  subscriptions: { kind: string; projectId: string | null }[];
};

/**
 * Destinatarios de un mensaje de un tipo (y, si lo hay, de un proyecto): contactos activos con correo que tengan ese
 * tipo o «todo», marcados para ese proyecto o para todos. Lista vacía = no hay a quién escribir (el paso se bloquea).
 */
export function recipientsFor(contacts: ContactForRouting[], kind: CommsKind, projectId: string | null): ContactForRouting[] {
  return contacts.filter(
    (c) =>
      c.active &&
      Boolean(c.email && c.email.includes('@')) &&
      c.subscriptions.some((s) => (s.kind === kind || s.kind === 'todo') && (s.projectId === null || s.projectId === projectId))
  );
}

export type ApprovalSetting = 'heredar' | 'siempre' | 'nunca';

/** ¿Pasa por aprobación? Lo del cliente manda; si hereda, lo de la cuenta (por defecto, siempre). */
export function needsApproval(tenantDefault: string | null | undefined, clientSetting: string | null | undefined): boolean {
  if (clientSetting === 'siempre') return true;
  if (clientSetting === 'nunca') return false;
  return tenantDefault !== 'nunca';
}

/** Identificador del hilo (Message-ID sin «<>»): las respuestas del cliente lo traen en In-Reply-To / References. */
export function threadKeyFor(messageId: string, domain: string): string {
  return `cm-${messageId}@${domain.replace(/^@/, '') || 'kijutech.local'}`;
}

/** Normaliza un Message-ID para compararlo (sin «<>», sin espacios, en minúsculas). */
export function normalizeThreadKey(v: string | null | undefined): string | null {
  const t = (v ?? '').trim().replace(/^<|>$/g, '').toLowerCase();
  return t || null;
}

/** De una cabecera References (varios Message-ID) o In-Reply-To, los identificadores que son nuestros. */
export function ourThreadKeys(header: string | null | undefined): string[] {
  return [...(header ?? '').matchAll(/<?([^<>\s]+@[^<>\s]+)>?/g)].map((m) => m[1].toLowerCase()).filter((k) => k.startsWith('cm-'));
}
