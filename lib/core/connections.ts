import 'server-only';

// Núcleo · conexiones del cliente con herramientas externas (27 nov 2026; docs/DISENO-SEO-CIERRE.md §C con la auditoría
// Opus). Decisión de Enric: WordPress en el núcleo (lo usarán SEO, Webs y Ads) y GoHighLevel para los leads.
// Seguridad:
// - El secreto va cifrado (lib/ai/encryption.ts) y nunca sale de aquí (la pantalla recibe solo un resumen enmascarado).
// - WordPress: lista blanca de permisos (solo «Colaborador»), comprobada al conectar Y antes de cada borrador; https, host
//   de una web del cliente, sin seguir redirecciones (publicFetch); cambiar la URL o el usuario obliga a escribir la
//   contraseña otra vez; solo se CREAN entradas en borrador, nunca se edita nada existente.
// - GoHighLevel: host fijo, solo lectura (forms.readonly). De cada lead, lo mínimo (lib/core/leads-rules.ts).
// - Nunca se registran cabeceras ni cuerpos de respuesta en los errores.
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientAssets, clientConnections, clientLeads, clients, type ClientConnection } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/ai/encryption';
import { publicFetch } from '@/lib/core/net';
import { ensureScheduleIfMissing, registerJobKind, registerProcess } from '@/lib/core/jobs';
import { maskTail, siteHost, wpBaseUrl, wpEditUrl, wpUserProblem } from '@/lib/core/connections-rules';
import { parseGhlSubmission, type LeadChannel } from '@/lib/core/leads-rules';

export class ConnectionError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

export type ConnectionView = { kind: 'wordpress' | 'gohighlevel'; baseUrl: string | null; externalId: string | null; username: string | null; secretHint: string; status: string; lastOkAt: string | null; lastError: string | null; lastSyncAt: string | null; detail: Record<string, unknown> };

async function getConn(tenantId: string, clientId: string, kind: 'wordpress' | 'gohighlevel'): Promise<ClientConnection | null> {
  const [c] = await db.select().from(clientConnections).where(and(eq(clientConnections.tenantId, tenantId), eq(clientConnections.clientId, clientId), eq(clientConnections.kind, kind))).limit(1);
  return c ?? null;
}
const secretOf = (c: ClientConnection) => decrypt(c.secretEncrypted, c.secretIv);

async function ownClient(tenantId: string, clientId: string): Promise<boolean> {
  const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))).limit(1);
  return Boolean(c);
}

export async function listConnections(tenantId: string, clientId: string): Promise<ConnectionView[]> {
  const rows = await db.select().from(clientConnections).where(and(eq(clientConnections.tenantId, tenantId), eq(clientConnections.clientId, clientId)));
  return rows.map((r) => {
    let hint = '••••';
    try {
      hint = maskTail(secretOf(r));
    } catch {}
    return { kind: r.kind as ConnectionView['kind'], baseUrl: r.baseUrl, externalId: r.externalId, username: r.username, secretHint: hint, status: r.status, lastOkAt: r.lastOkAt?.toISOString() ?? null, lastError: r.lastError, lastSyncAt: r.lastSyncAt?.toISOString() ?? null, detail: r.detail };
  });
}

export async function deleteConnection(tenantId: string, clientId: string, kind: 'wordpress' | 'gohighlevel'): Promise<void> {
  await db.delete(clientConnections).where(and(eq(clientConnections.tenantId, tenantId), eq(clientConnections.clientId, clientId), eq(clientConnections.kind, kind)));
}

async function save(tenantId: string, clientId: string, kind: 'wordpress' | 'gohighlevel', v: { baseUrl: string | null; externalId: string | null; username: string | null; secret: string; detail: Record<string, unknown>; by: string }) {
  const { encrypted, iv } = encrypt(v.secret);
  const values = { baseUrl: v.baseUrl, externalId: v.externalId, username: v.username, secretEncrypted: encrypted, secretIv: iv, status: 'ok', detail: v.detail, lastOkAt: new Date(), lastError: null, updatedAt: new Date() };
  await db
    .insert(clientConnections)
    .values({ tenantId, clientId, kind, createdBy: v.by.slice(0, 120), ...values })
    .onConflictDoUpdate({ target: [clientConnections.tenantId, clientConnections.clientId, clientConnections.kind], set: values });
}

async function markError(id: string, msg: string) {
  await db.update(clientConnections).set({ status: 'error', lastError: msg.slice(0, 300), updatedAt: new Date() }).where(eq(clientConnections.id, id));
}

// --- WordPress -----------------------------------------------------------------------------------------------------

const wpAuth = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass.replace(/\s+/g, ' ').trim()}`).toString('base64')}`;
const WP_UA = 'kijutech-tool/1.0 (+borradores)';

async function wpJson(url: string, init: { method?: string; auth?: string; body?: unknown }): Promise<{ status: number; json: unknown; location: string | null }> {
  const res = await publicFetch(url, {
    method: init.method ?? 'GET',
    headers: { 'user-agent': WP_UA, accept: 'application/json', ...(init.auth ? { authorization: init.auth } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000)
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json, location: res.headers.get('location') };
}

async function clientWebs(tenantId: string, clientId: string): Promise<string[]> {
  const rows = await db.select({ value: clientAssets.value }).from(clientAssets).where(and(eq(clientAssets.tenantId, tenantId), eq(clientAssets.clientId, clientId), sql`${clientAssets.kind} IN ('web', 'dominio')`));
  return rows.map((r) => r.value ?? '').filter(Boolean);
}

/** Comprueba el usuario (lista blanca). Lanza ConnectionError con el motivo. */
async function wpCheckUser(origin: string, auth: string): Promise<{ id: number; name: string }> {
  const r = await wpJson(`${origin}/wp-json/wp/v2/users/me?context=edit`, { auth });
  if (r.status >= 300 && r.status < 400) throw new ConnectionError(`La web redirige${r.location ? ` a ${siteHost(r.location) ?? 'otra dirección'}` : ''}: conecta con la dirección final (con o sin www).`);
  if (r.status === 401 || r.status === 403) throw new ConnectionError('WordPress rechazó el usuario o la contraseña de aplicación (o un plugin de seguridad como Wordfence, o el hosting, bloquea las contraseñas de aplicación).');
  if (r.status === 404) throw new ConnectionError('No se encuentra la API de WordPress (/wp-json). ¿Es una web WordPress? ¿Está desactivada la API REST?');
  if (r.status !== 200) throw new ConnectionError(`WordPress respondió ${r.status}.`);
  const me = r.json as { id?: number; name?: string; roles?: unknown; capabilities?: unknown } | null;
  const problem = wpUserProblem(me);
  if (problem) throw new ConnectionError(problem);
  return { id: Number(me!.id), name: String(me!.name ?? '') };
}

/** Conectar (o cambiar) WordPress. Si no se escribe la contraseña, solo vale si la URL y el usuario no cambian. */
export async function connectWordPress(tenantId: string, clientId: string, input: { url: string; username: string; password: string | null }, by: string): Promise<{ user: string }> {
  if (!(await ownClient(tenantId, clientId))) throw new ConnectionError('Cliente no encontrado.');
  const base = wpBaseUrl(input.url, await clientWebs(tenantId, clientId));
  if ('error' in base) throw new ConnectionError(base.error);
  const username = input.username.trim().slice(0, 120);
  if (!username) throw new ConnectionError('Escribe el usuario de WordPress.');
  const prev = await getConn(tenantId, clientId, 'wordpress');
  let password = input.password?.trim() || null;
  if (!password) {
    if (!prev || prev.baseUrl !== base.origin || prev.username !== username) throw new ConnectionError('Escribe la contraseña de aplicación (al cambiar la web o el usuario hay que volver a escribirla).');
    password = secretOf(prev);
  }
  const me = await wpCheckUser(base.origin, wpAuth(username, password));
  await save(tenantId, clientId, 'wordpress', { baseUrl: base.origin, externalId: String(me.id), username, secret: password, detail: { role: 'contributor', displayName: me.name.slice(0, 80) }, by });
  return { user: me.name };
}

/** Crea una entrada NUEVA en borrador. Vuelve a comprobar los permisos antes. Nunca edita nada existente. */
export async function createWordPressDraft(tenantId: string, clientId: string, draft: { title: string; html: string; slug?: string | null; excerpt?: string | null }): Promise<{ postId: number; editUrl: string }> {
  const c = await getConn(tenantId, clientId, 'wordpress');
  if (!c || !c.baseUrl || !c.username) throw new ConnectionError('Este cliente no tiene WordPress conectado (ficha → Webs y cuentas → Conexiones).');
  const auth = wpAuth(c.username, secretOf(c));
  try {
    await wpCheckUser(c.baseUrl, auth);
  } catch (e) {
    if (e instanceof ConnectionError) await markError(c.id, e.userMessage);
    throw e;
  }
  const r = await wpJson(`${c.baseUrl}/wp-json/wp/v2/posts`, { method: 'POST', auth, body: { title: draft.title.slice(0, 200), content: draft.html.slice(0, 100_000), status: 'draft', ...(draft.slug ? { slug: draft.slug.slice(0, 80) } : {}), ...(draft.excerpt ? { excerpt: draft.excerpt.slice(0, 300) } : {}) } });
  const post = r.json as { id?: number; status?: string } | null;
  if (r.status !== 201 || !post?.id) {
    await markError(c.id, `No se pudo crear el borrador (${r.status}).`);
    throw new ConnectionError(`WordPress no creó el borrador (respondió ${r.status}).`);
  }
  await db.update(clientConnections).set({ status: 'ok', lastOkAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(clientConnections.id, c.id));
  return { postId: post.id, editUrl: wpEditUrl(c.baseUrl, post.id) };
}

/** Estado de una entrada creada por nosotros: si ya está publicada, su URL (solo si es de la web del cliente). */
export async function wordPressPostState(tenantId: string, clientId: string, postId: number): Promise<{ status: string; url: string | null } | null> {
  const c = await getConn(tenantId, clientId, 'wordpress');
  if (!c || !c.baseUrl || !c.username) return null;
  const r = await wpJson(`${c.baseUrl}/wp-json/wp/v2/posts/${Math.trunc(postId)}?context=edit`, { auth: wpAuth(c.username, secretOf(c)) });
  if (r.status === 404 || r.status === 410) return { status: 'borrado', url: null };
  if (r.status !== 200) return null;
  const p = r.json as { status?: string; link?: string } | null;
  const link = typeof p?.link === 'string' && /^https:\/\//.test(p.link) && siteHost(p.link) === siteHost(c.baseUrl) ? p.link : null;
  return { status: String(p?.status ?? ''), url: p?.status === 'publish' ? link : null };
}

export async function hasWordPress(tenantId: string, clientId: string): Promise<boolean> {
  const c = await getConn(tenantId, clientId, 'wordpress');
  return Boolean(c && c.status === 'ok');
}

// --- GoHighLevel (leads, solo lectura) -------------------------------------------------------------------------------

const GHL = 'https://services.leadconnectorhq.com';
const GHL_HEADERS = (token: string) => ({ Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json', 'User-Agent': 'kijutech-tool/1.0' });

async function ghlGet<T>(token: string, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GHL}${path}`, { headers: GHL_HEADERS(token), signal: AbortSignal.timeout(30_000), cache: 'no-store' });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 11_000));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new ConnectionError('GoHighLevel rechazó el token (¿caducado, rotado o sin el permiso forms.readonly?).');
    if (!res.ok) throw new ConnectionError(`GoHighLevel respondió ${res.status}.`);
    return (await res.json()) as T;
  }
}

export async function connectGoHighLevel(tenantId: string, clientId: string, input: { locationId: string; token: string | null }, by: string): Promise<{ forms: number }> {
  if (!(await ownClient(tenantId, clientId))) throw new ConnectionError('Cliente no encontrado.');
  const locationId = input.locationId.trim();
  if (!/^[A-Za-z0-9]{8,40}$/.test(locationId)) throw new ConnectionError('El ID de la subcuenta no es válido (GoHighLevel → Ajustes → Perfil de empresa).');
  const prev = await getConn(tenantId, clientId, 'gohighlevel');
  let token = input.token?.trim() || null;
  if (!token) {
    if (!prev || prev.externalId !== locationId) throw new ConnectionError('Escribe el token de la integración privada.');
    token = secretOf(prev);
  }
  const forms = await ghlGet<{ forms?: { id: string; name: string }[]; total?: number }>(token, `/forms/?locationId=${encodeURIComponent(locationId)}&limit=50`);
  await save(tenantId, clientId, 'gohighlevel', { baseUrl: null, externalId: locationId, username: null, secret: token, detail: { forms: (forms.forms ?? []).map((f) => ({ id: f.id, name: String(f.name).slice(0, 120) })).slice(0, 50) }, by });
  await ensureScheduleIfMissing(tenantId, LEADS_SYNC, '', 1440, new Date(Date.now() + 60_000));
  return { forms: forms.forms?.length ?? 0 };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Descarga los envíos nuevos de un cliente (desde la última vez − 2 días, o 35 días la primera). */
export async function syncClientLeads(tenantId: string, clientId: string): Promise<{ added: number; pages: number }> {
  const c = await getConn(tenantId, clientId, 'gohighlevel');
  if (!c || !c.externalId) return { added: 0, pages: 0 };
  const token = secretOf(c);
  const from = c.lastSyncAt ? new Date(c.lastSyncAt.getTime() - 2 * 86_400_000) : new Date(Date.now() - 35 * 86_400_000);
  const to = new Date(Date.now() + 86_400_000);
  try {
    const forms = await ghlGet<{ forms?: { id: string; name: string }[] }>(token, `/forms/?locationId=${encodeURIComponent(c.externalId)}&limit=50`);
    const names = new Map((forms.forms ?? []).map((f) => [f.id, String(f.name).slice(0, 200)]));
    let added = 0;
    let page = 1;
    for (; page <= 30; page++) {
      const r = await ghlGet<{ submissions?: unknown[]; meta?: { nextPage?: number | null } }>(token, `/forms/submissions?locationId=${encodeURIComponent(c.externalId)}&startAt=${ymd(from)}&endAt=${ymd(to)}&page=${page}&limit=100`);
      const leads = (r.submissions ?? []).map(parseGhlSubmission).filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (leads.length) {
        const ins = await db
          .insert(clientLeads)
          .values(leads.map((l) => ({ tenantId, clientId, provider: 'gohighlevel', externalId: l.externalId, formId: l.formId, formName: l.formId ? (names.get(l.formId) ?? null) : null, pageUrl: l.pageUrl, referrer: l.referrer, channel: l.channel, utm: l.utm, hasGclid: l.hasGclid, submittedAt: l.submittedAt })))
          .onConflictDoNothing()
          .returning({ id: clientLeads.id });
        added += ins.length;
      }
      if (!r.meta?.nextPage) break;
    }
    await db.update(clientConnections).set({ status: 'ok', lastOkAt: new Date(), lastSyncAt: new Date(), lastError: null, detail: { ...c.detail, forms: [...names].map(([id, name]) => ({ id, name })).slice(0, 50) }, updatedAt: new Date() }).where(eq(clientConnections.id, c.id));
    // Retención: 25 meses (los leads de más de dos años ya no sirven para comparar con el año anterior).
    await db.delete(clientLeads).where(and(eq(clientLeads.clientId, clientId), lt(clientLeads.submittedAt, new Date(Date.now() - 25 * 31 * 86_400_000))));
    return { added, pages: page };
  } catch (e) {
    await markError(c.id, e instanceof ConnectionError ? e.userMessage : 'Fallo al descargar los leads.');
    throw e;
  }
}

export async function syncAllLeads(tenantId: string): Promise<{ clients: number; added: number }> {
  const rows = await db.select({ clientId: clientConnections.clientId }).from(clientConnections).where(and(eq(clientConnections.tenantId, tenantId), eq(clientConnections.kind, 'gohighlevel')));
  let added = 0;
  for (const r of rows) {
    try {
      added += (await syncClientLeads(tenantId, r.clientId)).added;
    } catch (e) {
      console.error('[núcleo] leads: cliente', r.clientId, e instanceof Error ? e.message : 'error');
    }
  }
  return { clients: rows.length, added };
}

export type LeadsSummary = {
  connected: boolean;
  lastSyncAt: string | null;
  byMonth: { month: string; total: number; organico: number }[];
  byChannel: { channel: LeadChannel; n: number }[];
  byPage: { url: string; n: number; organico: number }[];
  thisMonth: number;
  prevMonth: number;
};

/** Resumen de leads de un cliente (para el panel en vivo y el informe): solo tablas propias, sin llamadas externas. */
export async function leadsSummary(tenantId: string, clientId: string, months = 12): Promise<LeadsSummary> {
  const c = await getConn(tenantId, clientId, 'gohighlevel');
  const since = new Date(Date.now() - months * 31 * 86_400_000);
  const base = and(eq(clientLeads.tenantId, tenantId), eq(clientLeads.clientId, clientId), gte(clientLeads.submittedAt, since));
  const [byMonth, byChannel, byPage] = await Promise.all([
    db
      .select({ month: sql<string>`to_char(${clientLeads.submittedAt} AT TIME ZONE 'Europe/Madrid', 'YYYY-MM')`, total: sql<number>`count(*)::int`, organico: sql<number>`count(*) FILTER (WHERE ${clientLeads.channel} = 'organico')::int` })
      .from(clientLeads)
      .where(base)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db.select({ channel: clientLeads.channel, n: sql<number>`count(*)::int` }).from(clientLeads).where(and(base, gte(clientLeads.submittedAt, new Date(Date.now() - 90 * 86_400_000)))).groupBy(clientLeads.channel).orderBy(desc(sql`2`)),
    db
      .select({ url: clientLeads.pageUrl, n: sql<number>`count(*)::int`, organico: sql<number>`count(*) FILTER (WHERE ${clientLeads.channel} = 'organico')::int` })
      .from(clientLeads)
      .where(and(base, gte(clientLeads.submittedAt, new Date(Date.now() - 90 * 86_400_000)), sql`${clientLeads.pageUrl} IS NOT NULL`))
      .groupBy(clientLeads.pageUrl)
      .orderBy(desc(sql`2`))
      .limit(15)
  ]);
  const ym = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  return {
    connected: Boolean(c),
    lastSyncAt: c?.lastSyncAt?.toISOString() ?? null,
    byMonth: byMonth.map((r) => ({ month: r.month, total: Number(r.total), organico: Number(r.organico) })),
    byChannel: byChannel.map((r) => ({ channel: r.channel as LeadChannel, n: Number(r.n) })),
    byPage: byPage.map((r) => ({ url: r.url!, n: Number(r.n), organico: Number(r.organico) })),
    thisMonth: Number(byMonth.find((m) => m.month === ym(now))?.total ?? 0),
    prevMonth: Number(byMonth.find((m) => m.month === ym(prev))?.total ?? 0)
  };
}

export const LEADS_SYNC = 'clientes.leads';
let registered = false;
export function registerConnectionJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: LEADS_SYNC, timeoutS: 600, maxConcurrent: 1, maxAttempts: 2, run: async (ctx) => syncAllLeads(ctx.tenantId) });
  registerProcess({ key: LEADS_SYNC, scopeType: 'cuenta', label: 'Clientes: leads de GoHighLevel (formularios de la web)', defaultEveryMinutes: 1440, enqueue: () => ({ kind: LEADS_SYNC, priority: 7 }) });
}
