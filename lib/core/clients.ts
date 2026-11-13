import 'server-only';

// El cliente del NÚCLEO (14 nov 2026; docs/DISENO-FICHA-CLIENTE.md): la ficha completa que ven todos los módulos.
//   clients · client_contacts · client_locations · client_assets · client_competitors · client_memory
// Este archivo no conoce a ningún módulo. Operaciones guarda sus ajustes en ops_clients (mismo id) y aporta lo suyo
// por el registro del núcleo (p. ej. impedir borrar un cliente con encargos).
// Las funciones lanzan ClientError con un mensaje apto para el usuario cuando algo no es válido.
import { and, asc, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  clientAssets,
  clientCompetitors,
  clientContacts,
  clientLocations,
  clientMemory,
  clients,
  type Client,
  type ClientAsset,
  type ClientCompetitor,
  type ClientContact,
  type ClientLocation,
  type ClientMemory
} from '@/lib/db/schema';
import { clientDeleteBlockers } from '@/lib/core/capabilities';
import {
  ACCESS_LABEL,
  ASSET_KIND_LABEL,
  CHANNEL_LABEL,
  CONTACT_ROLE_LABEL,
  MEMORY_KIND_LABELS,
  STATUS_LABEL,
  completeness,
  domainOf,
  hasSecret,
  isAccess,
  isAssetKind,
  isChannel,
  isClientStatus,
  isContactRole,
  isMemoryKind,
  normEmail,
  normalizeUrl,
  recognizableDomain,
  validateMemoryText,
  type AccessLevel,
  type AssetKind,
  type ClientStatus,
  type MemoryKind,
  type SenderLike
} from '@/lib/core/client-rules';

export class ClientError extends Error {
  readonly userMessage: string;
  constructor(message: string) {
    super(message);
    this.userMessage = message;
  }
}

const t = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return s ? s : null;
};
const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export type ClientSheet = {
  client: Client;
  contacts: ClientContact[];
  locations: ClientLocation[];
  assets: ClientAsset[];
  competitors: ClientCompetitor[];
  memory: ClientMemory[];
};

// --- Lectura --------------------------------------------------------------------------------------------------------

export async function listCoreClients(tenantId: string): Promise<Client[]> {
  return db.select().from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name));
}

export async function getClient(tenantId: string, id: string): Promise<Client | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.tenantId, tenantId))).limit(1);
  return c ?? null;
}

export async function getClientSheet(tenantId: string, id: string): Promise<ClientSheet | null> {
  const client = await getClient(tenantId, id);
  if (!client) return null;
  const [contacts, locations, assets, competitors, memory] = await Promise.all([
    db.select().from(clientContacts).where(eq(clientContacts.clientId, id)).orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name)),
    db.select().from(clientLocations).where(eq(clientLocations.clientId, id)).orderBy(desc(clientLocations.isPrimary), asc(clientLocations.createdAt)),
    db.select().from(clientAssets).where(eq(clientAssets.clientId, id)).orderBy(asc(clientAssets.kind), desc(clientAssets.isPrimary), asc(clientAssets.createdAt)),
    db.select().from(clientCompetitors).where(eq(clientCompetitors.clientId, id)).orderBy(asc(clientCompetitors.name)),
    db.select().from(clientMemory).where(eq(clientMemory.clientId, id)).orderBy(desc(clientMemory.createdAt))
  ]);
  return { client, contacts, locations, assets, competitors, memory };
}

/** Completitud de varios clientes de una vez (lista de clientes). */
export async function completenessByClient(tenantId: string): Promise<Map<string, { pct: number; missing: number }>> {
  const [cs, contacts, locations, assets, competitors] = await Promise.all([
    listCoreClients(tenantId),
    db.select({ clientId: clientContacts.clientId, isPrimary: clientContacts.isPrimary, email: clientContacts.email, phone: clientContacts.phone, active: clientContacts.active }).from(clientContacts).where(eq(clientContacts.tenantId, tenantId)),
    db.select({ clientId: clientLocations.clientId, address: clientLocations.address }).from(clientLocations).where(eq(clientLocations.tenantId, tenantId)),
    db.select({ clientId: clientAssets.clientId, kind: clientAssets.kind, access: clientAssets.access }).from(clientAssets).where(eq(clientAssets.tenantId, tenantId)),
    db.select({ clientId: clientCompetitors.clientId }).from(clientCompetitors).where(eq(clientCompetitors.tenantId, tenantId))
  ]);
  const by = <T extends { clientId: string }>(rows: T[], id: string) => rows.filter((r) => r.clientId === id);
  return new Map(
    cs.map((c) => {
      const r = completeness({ client: c, contacts: by(contacts, c.id), locations: by(locations, c.id), assets: by(assets, c.id), competitors: by(competitors, c.id) });
      return [c.id, { pct: r.pct, missing: r.missing.length }];
    })
  );
}

/** Reglas para saber de qué cliente es un correo: correos de los contactos activos y dominios que reconocen correos. */
export async function emailMatchRules(tenantId: string): Promise<SenderLike[]> {
  const [emails, domains] = await Promise.all([
    db.select({ clientId: clientContacts.clientId, value: clientContacts.email, active: clientContacts.active }).from(clientContacts).where(and(eq(clientContacts.tenantId, tenantId), isNotNull(clientContacts.email))),
    db.select({ clientId: clientAssets.clientId, value: clientAssets.emailDomain }).from(clientAssets).where(and(eq(clientAssets.tenantId, tenantId), isNotNull(clientAssets.emailDomain)))
  ]);
  return [
    ...emails.map((e) => ({ clientId: e.clientId, kind: 'email', value: e.value!, active: e.active })),
    ...domains.map((d) => ({ clientId: d.clientId, kind: 'domain', value: d.value!, active: true }))
  ];
}

// --- Cliente ----------------------------------------------------------------------------------------------------

export type ClientProfileInput = Partial<{
  name: string;
  aliases: string[];
  status: string;
  sector: string;
  summary: string;
  logoUrl: string;
  legalName: string;
  taxId: string;
  fiscalAddress: string;
  business: string;
  offerings: string;
  area: string;
  audience: string;
  valueProposition: string;
  brandTone: string;
  goals: string;
  strategy: string;
  notes: string;
  startedAt: string;
  endedAt: string;
  endReason: string;
}>;
export type ClientContractInput = Partial<{ contractServices: string; monthlyFee: number | null; contractStart: string; contractRenewal: string }>;

const LONG = 8000;

function profileValues(input: ClientProfileInput) {
  if (hasSecret(...Object.values(input))) throw new ClientError('En la ficha no se guardan contraseñas ni accesos: quítalos del texto.');
  const v: Partial<typeof clients.$inferInsert> = {};
  if (input.name !== undefined) {
    const n = t(input.name, 255);
    if (!n) throw new ClientError('El nombre es obligatorio.');
    v.name = n;
  }
  if (input.aliases !== undefined) v.aliases = [...new Map(input.aliases.map((a) => a.trim().slice(0, 120)).filter(Boolean).map((a) => [normName(a), a])).values()].slice(0, 30);
  if (input.status !== undefined) {
    if (!isClientStatus(input.status)) throw new ClientError('Estado no válido.');
    v.status = input.status;
  }
  const text: [keyof ClientProfileInput, keyof typeof v, number][] = [
    ['sector', 'sector', 120],
    ['summary', 'summary', 1000],
    ['logoUrl', 'logoUrl', 500],
    ['legalName', 'legalName', 255],
    ['taxId', 'taxId', 30],
    ['fiscalAddress', 'fiscalAddress', 500],
    ['business', 'business', LONG],
    ['offerings', 'offerings', LONG],
    ['area', 'area', 255],
    ['audience', 'audience', LONG],
    ['valueProposition', 'valueProposition', LONG],
    ['brandTone', 'brandTone', LONG],
    ['goals', 'goals', LONG],
    ['strategy', 'strategy', LONG],
    ['notes', 'notes', LONG],
    ['endReason', 'endReason', 1000]
  ];
  for (const [k, col, max] of text) if (input[k] !== undefined) (v as Record<string, unknown>)[col] = t(input[k], max);
  for (const k of ['startedAt', 'endedAt'] as const) {
    if (input[k] === undefined) continue;
    if (input[k] && !isDate(input[k])) throw new ClientError('Fecha no válida (AAAA-MM-DD).');
    v[k] = input[k] || null;
  }
  return v;
}

function contractValues(input: ClientContractInput) {
  const v: Partial<typeof clients.$inferInsert> = {};
  if (input.contractServices !== undefined) v.contractServices = t(input.contractServices, 2000);
  if (input.monthlyFee !== undefined) {
    if (input.monthlyFee !== null && !(Number.isFinite(input.monthlyFee) && input.monthlyFee >= 0 && input.monthlyFee < 1_000_000)) throw new ClientError('La cuota no es válida.');
    v.monthlyFee = input.monthlyFee === null ? null : input.monthlyFee.toFixed(2);
  }
  for (const k of ['contractStart', 'contractRenewal'] as const) {
    if (input[k] === undefined) continue;
    if (input[k] && !isDate(input[k])) throw new ClientError('Fecha no válida (AAAA-MM-DD).');
    v[k] = input[k] || null;
  }
  return v;
}

async function assertUniqueName(tenantId: string, name: string, exceptId: string | null) {
  const all = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId));
  const dup = all.find((c) => c.id !== exceptId && normName(c.name) === normName(name));
  if (dup) throw new ClientError(`Ya existe una ficha «${dup.name}».`);
}

export async function createCoreClient(tenantId: string, profile: ClientProfileInput & { name: string }, contract: ClientContractInput = {}): Promise<string> {
  const v = { ...profileValues(profile), ...contractValues(contract) };
  await assertUniqueName(tenantId, v.name!, null);
  const [row] = await db
    .insert(clients)
    .values({ ...v, name: v.name!, tenantId })
    .returning({ id: clients.id });
  return row.id;
}

export async function updateCoreClient(tenantId: string, id: string, profile: ClientProfileInput, contract: ClientContractInput = {}): Promise<void> {
  const v = { ...profileValues(profile), ...contractValues(contract) };
  if (v.name) await assertUniqueName(tenantId, v.name, id);
  if (!Object.keys(v).length) return;
  const res = await db
    .update(clients)
    .set({ ...v, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)))
    .returning({ id: clients.id });
  if (!res.length) throw new ClientError('La ficha no existe.');
}

export async function setClientStatus(tenantId: string, id: string, status: ClientStatus, endReason?: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const c = await getClient(tenantId, id);
  if (!c) throw new ClientError('La ficha no existe.');
  await db
    .update(clients)
    .set({
      status,
      ...(status === 'baja' ? { endedAt: c.endedAt ?? today, endReason: t(endReason, 1000) ?? c.endReason } : { endedAt: null }),
      ...((status === 'activo' || status === 'onboarding') && !c.startedAt ? { startedAt: today } : {}),
      updatedAt: new Date()
    })
    .where(eq(clients.id, id));
}

/** Borra el cliente y todo lo suyo (en cascada). Antes pregunta a los módulos (p. ej. encargos en Operaciones). */
export async function deleteCoreClient(tenantId: string, id: string): Promise<void> {
  const c = await getClient(tenantId, id);
  if (!c) throw new ClientError('La ficha no existe.');
  const blockers = await clientDeleteBlockers(tenantId, id);
  if (blockers.length) throw new ClientError(`${blockers.join(' ')} Dale de baja en vez de borrarlo.`);
  await db.delete(clients).where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)));
}

async function ownClient(tenantId: string, clientId: string) {
  if (!(await getClient(tenantId, clientId))) throw new ClientError('La ficha no existe.');
}

// --- Contactos --------------------------------------------------------------------------------------------------

export type ContactInput = {
  id?: string | null;
  name?: string;
  jobTitle?: string;
  role?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  preferredChannel?: string;
  isPrimary?: boolean;
  notes?: string;
  active?: boolean;
};

export async function saveContact(tenantId: string, clientId: string, input: ContactInput): Promise<string> {
  await ownClient(tenantId, clientId);
  if (hasSecret(input.name, input.notes, input.jobTitle)) throw new ClientError('Aquí no se guardan contraseñas.');
  const email = input.email !== undefined && input.email.trim() ? normEmail(input.email) : input.email === undefined ? undefined : null;
  if (input.email && input.email.trim() && !email) throw new ClientError('El correo no es válido.');
  const name = t(input.name, 255) ?? (email ? email.split('@')[0] : null);
  if (!input.id && !name) throw new ClientError('Pon al menos el nombre o el correo del contacto.');
  if (input.role !== undefined && input.role && !isContactRole(input.role)) throw new ClientError('Rol no válido.');
  if (input.preferredChannel !== undefined && input.preferredChannel && !isChannel(input.preferredChannel)) throw new ClientError('Canal no válido.');
  if (email) {
    const [dup] = await db
      .select({ id: clientContacts.id, clientId: clientContacts.clientId, clientName: clients.name })
      .from(clientContacts)
      .innerJoin(clients, eq(clients.id, clientContacts.clientId))
      .where(and(eq(clientContacts.tenantId, tenantId), eq(clientContacts.email, email)))
      .limit(1);
    if (dup && dup.id !== input.id) throw new ClientError(dup.clientId === clientId ? 'Ese correo ya está en esta ficha.' : `Ese correo ya es de un contacto de «${dup.clientName}».`);
  }
  const values = {
    ...(name ? { name } : {}),
    ...(input.jobTitle !== undefined ? { jobTitle: t(input.jobTitle, 120) } : {}),
    ...(input.role !== undefined ? { role: input.role || 'otro' } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(input.phone !== undefined ? { phone: t(input.phone, 40) } : {}),
    ...(input.whatsapp !== undefined ? { whatsapp: t(input.whatsapp, 40) } : {}),
    ...(input.preferredChannel !== undefined ? { preferredChannel: input.preferredChannel || null } : {}),
    ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
    ...(input.notes !== undefined ? { notes: t(input.notes, 2000) } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    updatedAt: new Date()
  };
  return db.transaction(async (tx) => {
    let id = input.id ?? null;
    if (id) {
      const res = await tx.update(clientContacts).set(values).where(and(eq(clientContacts.id, id), eq(clientContacts.clientId, clientId), eq(clientContacts.tenantId, tenantId))).returning({ id: clientContacts.id });
      if (!res.length) throw new ClientError('El contacto no existe.');
    } else {
      const first = !(await tx.select({ id: clientContacts.id }).from(clientContacts).where(eq(clientContacts.clientId, clientId)).limit(1)).length;
      const [row] = await tx
        .insert(clientContacts)
        .values({ ...values, name: name!, tenantId, clientId, isPrimary: input.isPrimary ?? first })
        .returning({ id: clientContacts.id });
      id = row.id;
    }
    if (input.isPrimary) await tx.update(clientContacts).set({ isPrimary: false }).where(and(eq(clientContacts.clientId, clientId), ne(clientContacts.id, id)));
    return id;
  });
}

export async function deleteContact(tenantId: string, contactId: string): Promise<void> {
  const res = await db.delete(clientContacts).where(and(eq(clientContacts.id, contactId), eq(clientContacts.tenantId, tenantId))).returning({ id: clientContacts.id });
  if (!res.length) throw new ClientError('El contacto no existe.');
}

// --- Locales ----------------------------------------------------------------------------------------------------

export type LocationInput = {
  id?: string | null;
  name?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  region?: string;
  country?: string;
  phone?: string;
  hours?: string;
  isPrimary?: boolean;
  notes?: string;
};

export async function saveLocation(tenantId: string, clientId: string, input: LocationInput): Promise<string> {
  await ownClient(tenantId, clientId);
  if (hasSecret(...Object.values(input))) throw new ClientError('Aquí no se guardan contraseñas.');
  const values = {
    ...(input.name !== undefined ? { name: t(input.name, 255) } : {}),
    ...(input.address !== undefined ? { address: t(input.address, 500) } : {}),
    ...(input.city !== undefined ? { city: t(input.city, 120) } : {}),
    ...(input.postalCode !== undefined ? { postalCode: t(input.postalCode, 20) } : {}),
    ...(input.region !== undefined ? { region: t(input.region, 120) } : {}),
    ...(input.country !== undefined ? { country: t(input.country, 80) } : {}),
    ...(input.phone !== undefined ? { phone: t(input.phone, 40) } : {}),
    ...(input.hours !== undefined ? { hours: t(input.hours, 1000) } : {}),
    ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
    ...(input.notes !== undefined ? { notes: t(input.notes, 2000) } : {}),
    updatedAt: new Date()
  };
  if (!input.id && !values.name && !values.address && !values.city && !values.phone) throw new ClientError('Pon al menos el nombre, la dirección, la ciudad o el teléfono del local.');
  return db.transaction(async (tx) => {
    let id = input.id ?? null;
    if (id) {
      const res = await tx.update(clientLocations).set(values).where(and(eq(clientLocations.id, id), eq(clientLocations.clientId, clientId), eq(clientLocations.tenantId, tenantId))).returning({ id: clientLocations.id });
      if (!res.length) throw new ClientError('El local no existe.');
    } else {
      const first = !(await tx.select({ id: clientLocations.id }).from(clientLocations).where(eq(clientLocations.clientId, clientId)).limit(1)).length;
      const [row] = await tx.insert(clientLocations).values({ ...values, tenantId, clientId, isPrimary: input.isPrimary ?? first }).returning({ id: clientLocations.id });
      id = row.id;
    }
    if (input.isPrimary) await tx.update(clientLocations).set({ isPrimary: false }).where(and(eq(clientLocations.clientId, clientId), ne(clientLocations.id, id)));
    return id;
  });
}

export async function deleteLocation(tenantId: string, locationId: string): Promise<void> {
  const res = await db.delete(clientLocations).where(and(eq(clientLocations.id, locationId), eq(clientLocations.tenantId, tenantId))).returning({ id: clientLocations.id });
  if (!res.length) throw new ClientError('El local no existe.');
}

// --- Webs y cuentas -----------------------------------------------------------------------------------------------

export type AssetInput = {
  id?: string | null;
  kind?: string;
  label?: string;
  value?: string;
  access?: string;
  accessNotes?: string;
  isPrimary?: boolean;
  recognizeEmails?: boolean;
  notes?: string;
};

export async function saveAsset(tenantId: string, clientId: string, input: AssetInput): Promise<string> {
  await ownClient(tenantId, clientId);
  if (hasSecret(input.label, input.value, input.accessNotes, input.notes)) throw new ClientError('Aquí no se guardan contraseñas: solo dónde están los accesos.');
  const current = input.id ? (await db.select().from(clientAssets).where(and(eq(clientAssets.id, input.id), eq(clientAssets.clientId, clientId), eq(clientAssets.tenantId, tenantId))).limit(1))[0] : null;
  if (input.id && !current) throw new ClientError('Esa web o cuenta no existe.');
  const kind = (input.kind ?? current?.kind ?? '') as AssetKind;
  if (!isAssetKind(kind)) throw new ClientError('Tipo de web o cuenta no válido.');
  if (input.access !== undefined && !isAccess(input.access)) throw new ClientError('Acceso no válido.');
  const value = input.value !== undefined ? t(normalizeUrl(input.value), 500) : (current?.value ?? null);
  if (!input.id && !value && !t(input.label, 255)) throw new ClientError('Pon la dirección, el identificador o al menos el nombre.');
  const recognize = input.recognizeEmails ?? Boolean(current?.emailDomain);
  let emailDomain: string | null = null;
  if (recognize) {
    if (kind !== 'web' && kind !== 'dominio') throw new ClientError('Solo una web o un dominio pueden reconocer correos.');
    emailDomain = recognizableDomain(value);
    if (!emailDomain) throw new ClientError(domainOf(value) ? `«${domainOf(value)}» es un proveedor de correo público: añade el correo exacto en Contactos.` : 'Para reconocer correos hace falta un dominio válido.');
    const [dup] = await db
      .select({ id: clientAssets.id, clientId: clientAssets.clientId, clientName: clients.name })
      .from(clientAssets)
      .innerJoin(clients, eq(clients.id, clientAssets.clientId))
      .where(and(eq(clientAssets.tenantId, tenantId), eq(clientAssets.emailDomain, emailDomain)))
      .limit(1);
    if (dup && dup.id !== input.id) throw new ClientError(dup.clientId === clientId ? `Los correos de ${emailDomain} ya se reconocen con otra web de esta ficha.` : `Los correos de ${emailDomain} ya son de «${dup.clientName}».`);
  }
  const values = {
    kind,
    ...(input.label !== undefined ? { label: t(input.label, 255) } : {}),
    value,
    ...(input.access !== undefined ? { access: input.access as AccessLevel } : {}),
    ...(input.accessNotes !== undefined ? { accessNotes: t(input.accessNotes, 1000) } : {}),
    ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
    ...(input.notes !== undefined ? { notes: t(input.notes, 2000) } : {}),
    emailDomain,
    updatedAt: new Date()
  };
  return db.transaction(async (tx) => {
    let id = input.id ?? null;
    if (id) {
      await tx.update(clientAssets).set(values).where(eq(clientAssets.id, id));
    } else {
      const first = !(await tx.select({ id: clientAssets.id }).from(clientAssets).where(and(eq(clientAssets.clientId, clientId), eq(clientAssets.kind, kind))).limit(1)).length;
      const [row] = await tx.insert(clientAssets).values({ ...values, tenantId, clientId, isPrimary: input.isPrimary ?? first }).returning({ id: clientAssets.id });
      id = row.id;
    }
    if (input.isPrimary) await tx.update(clientAssets).set({ isPrimary: false }).where(and(eq(clientAssets.clientId, clientId), eq(clientAssets.kind, kind), ne(clientAssets.id, id)));
    return id;
  });
}

export async function deleteAsset(tenantId: string, assetId: string): Promise<void> {
  const res = await db.delete(clientAssets).where(and(eq(clientAssets.id, assetId), eq(clientAssets.tenantId, tenantId))).returning({ id: clientAssets.id });
  if (!res.length) throw new ClientError('Esa web o cuenta no existe.');
}

/** Activo principal de un tipo para un cliente (p. ej. su propiedad de Search Console), para las integraciones. */
export async function primaryAsset(tenantId: string, clientId: string, kind: AssetKind): Promise<ClientAsset | null> {
  const rows = await db
    .select()
    .from(clientAssets)
    .where(and(eq(clientAssets.tenantId, tenantId), eq(clientAssets.clientId, clientId), eq(clientAssets.kind, kind)))
    .orderBy(desc(clientAssets.isPrimary), asc(clientAssets.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

// --- Competencia --------------------------------------------------------------------------------------------------

export type CompetitorInput = { id?: string | null; name?: string; domain?: string; notes?: string; source?: 'manual' | 'agente' };

export async function saveCompetitor(tenantId: string, clientId: string, input: CompetitorInput): Promise<string> {
  await ownClient(tenantId, clientId);
  if (hasSecret(input.name, input.notes)) throw new ClientError('Aquí no se guardan contraseñas.');
  const domain = input.domain !== undefined ? (input.domain.trim() ? domainOf(input.domain) : null) : undefined;
  if (input.domain && input.domain.trim() && !domain) throw new ClientError('El dominio no es válido (ej.: competidor.com).');
  const name = t(input.name, 255) ?? domain ?? null;
  if (!input.id && !name) throw new ClientError('Pon el nombre o el dominio del competidor.');
  const values = {
    ...(name ? { name } : {}),
    ...(domain !== undefined ? { domain } : {}),
    ...(input.notes !== undefined ? { notes: t(input.notes, 2000) } : {})
  };
  if (input.id) {
    const res = await db.update(clientCompetitors).set(values).where(and(eq(clientCompetitors.id, input.id), eq(clientCompetitors.clientId, clientId), eq(clientCompetitors.tenantId, tenantId))).returning({ id: clientCompetitors.id });
    if (!res.length) throw new ClientError('Ese competidor no existe.');
    return input.id;
  }
  const [row] = await db
    .insert(clientCompetitors)
    .values({ ...values, name: name!, tenantId, clientId, source: input.source ?? 'manual' })
    .returning({ id: clientCompetitors.id });
  return row.id;
}

export async function deleteCompetitor(tenantId: string, competitorId: string): Promise<void> {
  const res = await db.delete(clientCompetitors).where(and(eq(clientCompetitors.id, competitorId), eq(clientCompetitors.tenantId, tenantId))).returning({ id: clientCompetitors.id });
  if (!res.length) throw new ClientError('Ese competidor no existe.');
}

// --- Memoria ------------------------------------------------------------------------------------------------------

export async function addMemory(
  tenantId: string,
  clientId: string,
  input: { kind: string; text: string; status?: 'propuesto' | 'aceptado'; sourceType?: 'manual' | 'email' | 'nota' | 'encargo' | 'agente'; sourceId?: string | null; by?: number | null }
): Promise<string> {
  await ownClient(tenantId, clientId);
  if (!isMemoryKind(input.kind)) throw new ClientError('Tipo de dato no válido.');
  const v = validateMemoryText(input.text);
  if (!v.ok) throw new ClientError(v.error);
  const accepted = (input.status ?? 'aceptado') === 'aceptado';
  const [row] = await db
    .insert(clientMemory)
    .values({
      tenantId,
      clientId,
      kind: input.kind,
      text: v.text,
      status: accepted ? 'aceptado' : 'propuesto',
      sourceType: input.sourceType ?? 'manual',
      sourceId: input.sourceId ?? null,
      createdBy: input.by ?? null,
      decidedBy: accepted ? (input.by ?? null) : null,
      decidedAt: accepted ? new Date() : null
    })
    .returning({ id: clientMemory.id });
  return row.id;
}

// --- Texto de la ficha para los agentes --------------------------------------------------------------------------

/** La ficha en texto (para la IA). La cuota solo si `withContract` (lo decide quien llama: dueño o administrador). */
export function sheetText(s: ClientSheet, opts: { withContract?: boolean } = {}): string {
  const c = s.client;
  const line = (label: string, v: string | null | undefined) => (v && v.trim() ? `${label}: ${v.trim()}` : '');
  const { pct, missing } = completeness(s);
  const accepted = s.memory.filter((m) => m.status === 'aceptado');
  return [
    `${c.name} · ${STATUS_LABEL[c.status as ClientStatus] ?? c.status}${c.sector ? ` · ${c.sector}` : ''}`,
    c.aliases.length ? `También se le llama: ${c.aliases.join(', ')}` : '',
    line('Resumen', c.summary),
    line('Razón social', c.legalName),
    line('CIF', c.taxId),
    line('Dirección fiscal', c.fiscalAddress),
    line('Negocio', c.business),
    line('Qué vende u ofrece', c.offerings),
    line('Zona', c.area),
    line('Público', c.audience),
    line('Propuesta de valor', c.valueProposition),
    line('Tono y marca', c.brandTone),
    line('Objetivos', c.goals),
    line('Estrategia', c.strategy),
    line('Notas', c.notes),
    line('Cliente desde', c.startedAt),
    c.status === 'baja' ? line('Baja', [c.endedAt, c.endReason].filter(Boolean).join(' · ')) : '',
    opts.withContract ? line('Contrato', [c.contractServices, c.monthlyFee ? `${c.monthlyFee} €/mes` : '', c.contractStart ? `desde ${c.contractStart}` : '', c.contractRenewal ? `renueva ${c.contractRenewal}` : ''].filter(Boolean).join(' · ')) : '',
    s.contacts.length
      ? `Contactos:\n${s.contacts
          .map((p) => `- ${p.name}${p.jobTitle ? ` (${p.jobTitle})` : ''} · ${CONTACT_ROLE_LABEL[p.role as keyof typeof CONTACT_ROLE_LABEL] ?? p.role}${p.isPrimary ? ' · principal' : ''}${p.email ? ` · ${p.email}` : ''}${p.phone ? ` · tel. ${p.phone}` : ''}${p.whatsapp ? ` · WhatsApp ${p.whatsapp}` : ''}${p.preferredChannel ? ` · prefiere ${CHANNEL_LABEL[p.preferredChannel as keyof typeof CHANNEL_LABEL] ?? p.preferredChannel}` : ''}${p.active ? '' : ' · inactivo'}`)
          .join('\n')}`
      : 'Contactos: ninguno',
    s.locations.length ? `Locales:\n${s.locations.map((l) => `- ${[l.name, l.address, l.postalCode, l.city, l.region, l.country].filter(Boolean).join(', ')}${l.phone ? ` · tel. ${l.phone}` : ''}${l.hours ? ` · ${l.hours}` : ''}${l.isPrimary ? ' · principal' : ''}`).join('\n')}` : '',
    s.assets.length
      ? `Webs y cuentas:\n${s.assets.map((a) => `- ${ASSET_KIND_LABEL[a.kind as AssetKind] ?? a.kind}${a.label ? ` «${a.label}»` : ''}${a.value ? `: ${a.value}` : ''} · ${ACCESS_LABEL[a.access as AccessLevel] ?? a.access}${a.accessNotes ? ` (${a.accessNotes})` : ''}${a.isPrimary ? ' · principal' : ''}${a.emailDomain ? ` · reconoce correos @${a.emailDomain}` : ''}`).join('\n')}`
      : 'Webs y cuentas: ninguna',
    s.competitors.length ? `Competencia:\n${s.competitors.map((x) => `- ${x.name}${x.domain ? ` (${x.domain})` : ''}${x.notes ? `: ${x.notes}` : ''}`).join('\n')}` : '',
    accepted.length ? `Memoria:\n${accepted.slice(0, 30).map((m) => `- (${MEMORY_KIND_LABELS[m.kind as MemoryKind] ?? m.kind}) ${m.text}`).join('\n')}` : 'Memoria: vacía',
    `Ficha completa al ${pct} %${missing.length ? `. Falta: ${missing.map((m) => m.label).join(', ')}` : ''}`
  ]
    .filter(Boolean)
    .join('\n');
}

/** Para pruebas y la lista: cuántos clientes hay por estado. */
export async function countByStatus(tenantId: string): Promise<Record<string, number>> {
  const rows = await db.select({ status: clients.status, n: sql<number>`count(*)::int` }).from(clients).where(eq(clients.tenantId, tenantId)).groupBy(clients.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

