import 'server-only';

// Fichas de cliente creadas o editadas por el agente (14 nov 2026, fase 1 de «fichas por Telegram»).
// El agente (Claude) redacta los campos a partir de lo que le cuenta Enric (texto o audio) y, si hay web, de lo que lee en
// ella; este módulo los VALIDA contra los datos reales (niveles, servicios, personas, opciones de ClickUp), prepara la
// vista previa para Telegram y, cuando Enric aprueba, los guarda. Nada se guarda sin pasar por el motor de acciones.
//   - Sin columnas nuevas: la web va en «Webs y herramientas»; teléfono y dirección en una línea «Contacto» de las notas;
//     los contactos con correo, en los remitentes del cliente (así sus correos se reconocen); el dominio de la web también.
//   - Nunca se guardan contraseñas (SECRET_RE, la misma regla que la ficha en la web).
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClientMemory, opsClients, opsClientSenders, opsClientServices, type OpsClientTool } from '@/lib/db/schema';
import { getLevels, getServices, listClients, normText, findClientByName, type ClientWithServices, type LevelRow } from '@/lib/operaciones/clients';
import { getStructure } from '@/lib/operaciones/structure';
import { escapeHtml } from '@/lib/operaciones/telegram';

export const SECRET_RE = /(contrase[ñn]a|password|passwd|pwd|clave de acceso)\s*[:=]/i;
export const MEMORY_KINDS = ['preferencia', 'promesa', 'decision', 'contexto', 'restriccion'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

const GENERIC_MAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'gmx.com', 'aol.com', 'telefonica.net']);
const TEXT_FIELDS = ['business', 'offerings', 'area', 'audience', 'goals', 'strategy', 'notes'] as const;
type TextField = (typeof TEXT_FIELDS)[number];
export const TEXT_LABEL: Record<TextField, string> = {
  business: 'Negocio',
  offerings: 'Qué vende u ofrece',
  area: 'Zona',
  audience: 'Público',
  goals: 'Objetivos',
  strategy: 'Estrategia',
  notes: 'Notas'
};

/** Lo que el agente pasa a la herramienta (nombres en español, como el resto de herramientas). */
export type AgentClientInput = {
  nombre?: string;
  alias?: string[];
  nivel?: string;
  servicios?: { servicio?: string; responsable?: string }[];
  servicios_quitar?: string[];
  web?: string;
  telefono?: string;
  direccion?: string;
  contactos?: { nombre?: string; cargo?: string; email?: string; telefono?: string }[];
  herramientas?: { nombre?: string; url?: string; nota?: string }[];
  negocio?: string;
  productos_servicios?: string;
  zona?: string;
  publico?: string;
  objetivos?: string;
  estrategia?: string;
  notas?: string;
  horas_mes?: number;
  activo?: boolean;
  memoria?: { tipo?: string; texto?: string }[];
};

/** Propuesta ya resuelta (serializable: va en la acción y la ejecuta el botón ✅). */
export type ClientPlan = {
  mode: 'crear' | 'editar';
  clientId: string | null;
  name: string;
  set: Partial<{
    name: string;
    aliases: string[];
    level: string;
    tools: OpsClientTool[];
    monthlyHours: string | null;
    active: boolean;
    clickupOptionId: string;
    clickupOptionLabel: string;
  }> &
    Partial<Record<TextField, string | null>>;
  servicesAdd: { key: string; label: string; responsibleClickupId: string | null; responsibleName: string | null }[];
  servicesRemove: { key: string; label: string }[];
  senders: { kind: 'email' | 'domain'; value: string; name: string | null; role: string | null }[];
  memory: { kind: MemoryKind; text: string }[];
  warnings: string[];
};

const s = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const words = (t: string) => normText(t).split(' ').filter(Boolean);

export function domainOf(url: string): string | null {
  const m = s(url, 500).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(m) ? m : null;
}

export function normalizeUrl(url: string): string {
  const u = s(url, 500);
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u.replace(/^\/+/, '')}`;
}

/** Línea «Contacto: Teléfono … · Dirección …» al principio de las notas (la crea o la actualiza). */
export function withContactLine(notes: string, phone: string, address: string): string {
  const lines = notes.split('\n');
  const idx = lines.findIndex((l) => /^contacto:/i.test(l.trim()));
  const old = idx >= 0 ? lines[idx] : '';
  const prevPhone = /Teléfono: ([^·\n]+)/i.exec(old)?.[1]?.trim() ?? '';
  const prevAddr = /Dirección: ([^·\n]+)/i.exec(old)?.[1]?.trim() ?? '';
  const parts = [phone || prevPhone ? `Teléfono: ${phone || prevPhone}` : '', address || prevAddr ? `Dirección: ${address || prevAddr}` : ''].filter(Boolean);
  if (!parts.length) return notes;
  const line = `Contacto: ${parts.join(' · ')}`;
  if (idx >= 0) lines[idx] = line;
  else lines.unshift(line);
  return lines.join('\n').trim();
}

function pickLevel(levels: LevelRow[], wanted: string): { key: string; defaulted: boolean } | null {
  if (!levels.length) return null;
  const q = normText(wanted);
  if (q) {
    const hit = levels.find((l) => normText(l.key) === q || normText(l.label) === q) ?? levels.find((l) => normText(l.label).includes(q));
    if (hit) return { key: hit.key, defaulted: false };
  }
  const def = levels.find((l) => /normal|estandar|medio/.test(normText(`${l.key} ${l.label}`))) ?? levels[0];
  return { key: def.key, defaulted: true };
}

function hasSecret(...parts: unknown[]): boolean {
  return parts.some((p) => typeof p === 'string' && SECRET_RE.test(p));
}

/**
 * Valida y resuelve lo que propone el agente. Devuelve el plan (para enseñar y guardar) o un error que el agente
 * puede entender y corregir (p. ej., «ya existe una ficha parecida»).
 */
export async function planClientChange(tenantId: string, mode: 'crear' | 'editar', input: AgentClientInput, target: ClientWithServices | null): Promise<{ plan: ClientPlan } | { error: string }> {
  if (hasSecret(JSON.stringify(input))) return { error: 'En la ficha no se guardan contraseñas ni claves: quítalas y vuelve a intentarlo (díselo a Enric).' };
  const [levels, services, structure, clients] = await Promise.all([getLevels(tenantId), getServices(tenantId), getStructure(tenantId), listClients(tenantId)]);
  const warnings: string[] = [];
  const set: ClientPlan['set'] = {};

  const name = s(input.nombre, 255);
  if (mode === 'crear') {
    if (!name) return { error: 'Falta el nombre del cliente.' };
    const dup = findClientByName(clients, name) ?? clients.find((c) => normText(c.name) === normText(name));
    if (dup) return { error: `Ya existe una ficha «${dup.name}»${dup.active ? '' : ' (desactivada)'}. Usa actualizar_cliente para completarla, o pregunta a Enric si es otro cliente.` };
    set.name = name;
  } else if (name && target && name !== target.name) {
    const dup = clients.find((c) => c.id !== target.id && normText(c.name) === normText(name));
    if (dup) return { error: `Ya hay otra ficha llamada «${dup.name}».` };
    set.name = name;
  }

  // Alias: los nuevos se suman a los que ya tenga (nunca se pierden).
  const currentAliases = target?.aliases ?? [];
  const newAliases = (input.alias ?? []).map((a) => s(a, 120)).filter((a) => a && normText(a) !== normText(name || target?.name || ''));
  const dom = input.web ? domainOf(input.web) : null;
  if (dom && mode === 'crear') newAliases.push(dom);
  const mergedAliases = [...new Map([...currentAliases, ...newAliases].map((a) => [normText(a), a])).values()].slice(0, 30);
  if (mergedAliases.length !== currentAliases.length) set.aliases = mergedAliases;

  // Nivel.
  if (mode === 'crear' || s(input.nivel)) {
    const lv = pickLevel(levels, s(input.nivel));
    if (!lv) return { error: 'No hay niveles de cliente configurados (Clientes → Niveles).' };
    if (mode === 'crear' || !lv.defaulted) set.level = lv.key;
    if (lv.defaulted && mode === 'crear') warnings.push(`Nivel «${levels.find((l) => l.key === lv.key)?.label ?? lv.key}» por defecto (no se dijo otro).`);
    if (lv.defaulted && mode === 'editar') warnings.push(`No reconozco el nivel «${s(input.nivel)}»: no lo cambio.`);
  }

  // Servicios.
  const active = services.filter((x) => x.active);
  const svcByText = (t: string) => {
    const q = normText(t);
    return active.find((x) => normText(x.key) === q || normText(x.label) === q) ?? active.find((x) => normText(x.label).includes(q) || q.includes(normText(x.label)));
  };
  const memberByText = (t: string) => {
    const q = normText(t);
    if (!q) return null;
    const m = structure.members.filter((x) => normText(x.username) === q || words(x.username).some((w) => w === q || w.startsWith(q)));
    return m.length === 1 ? m[0] : null;
  };
  const servicesAdd: ClientPlan['servicesAdd'] = [];
  for (const it of input.servicios ?? []) {
    const sv = svcByText(s(it.servicio, 120));
    if (!sv) {
      if (s(it.servicio)) warnings.push(`Servicio «${s(it.servicio, 60)}» no está en la lista de servicios: no lo pongo.`);
      continue;
    }
    const resp = memberByText(s(it.responsable, 120));
    if (s(it.responsable) && !resp) warnings.push(`No sé quién es «${s(it.responsable, 60)}» para ${sv.label}.`);
    if (!servicesAdd.some((x) => x.key === sv.key)) servicesAdd.push({ key: sv.key, label: sv.label, responsibleClickupId: resp?.id ?? null, responsibleName: resp?.username ?? null });
  }
  const servicesRemove: ClientPlan['servicesRemove'] = [];
  for (const t of input.servicios_quitar ?? []) {
    const sv = services.find((x) => normText(x.key) === normText(s(t)) || normText(x.label) === normText(s(t)));
    if (sv && target?.services.some((x) => x.serviceKey === sv.key)) servicesRemove.push({ key: sv.key, label: sv.label });
  }

  // Webs y herramientas: se suman a las que ya tenga (por URL o nombre).
  const tools: OpsClientTool[] = [...(target?.tools ?? [])];
  const addTool = (t: OpsClientTool) => {
    if (!t.name && !t.url) return;
    if (tools.some((x) => (t.url && normText(x.url) === normText(t.url)) || (!t.url && normText(x.name) === normText(t.name)))) return;
    tools.push(t);
  };
  if (input.web) addTool({ name: 'Web', url: normalizeUrl(input.web), note: '' });
  for (const t of input.herramientas ?? []) addTool({ name: s(t.nombre, 100), url: t.url ? normalizeUrl(t.url) : '', note: s(t.nota, 300) });
  if (tools.length !== (target?.tools ?? []).length) set.tools = tools.slice(0, 40);

  // Textos: reemplazan (el agente pasa el texto completo nuevo).
  const textIn: Record<TextField, string | undefined> = {
    business: input.negocio,
    offerings: input.productos_servicios,
    area: input.zona,
    audience: input.publico,
    goals: input.objetivos,
    strategy: input.estrategia,
    notes: input.notas
  };
  for (const f of TEXT_FIELDS) {
    if (typeof textIn[f] !== 'string') continue;
    const v = s(textIn[f], f === 'area' ? 255 : 6000);
    if (mode === 'crear' && !v) continue;
    if (v !== (target?.[f] ?? '')) set[f] = v || null;
  }

  // Contactos sin correo y teléfono/dirección del cliente → línea «Contacto» y lista en las notas.
  const senders: ClientPlan['senders'] = [];
  const contactLines: string[] = [];
  for (const c of input.contactos ?? []) {
    const nm = s(c.nombre, 120);
    const role = s(c.cargo, 120);
    const email = s(c.email, 255).toLowerCase().replace(/\s+/g, '');
    const phone = s(c.telefono, 40);
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) senders.push({ kind: 'email', value: email, name: nm || null, role: role || null });
    else if (email) warnings.push(`Correo «${email}» no válido.`);
    if (nm || phone) contactLines.push(`- ${[nm, role, phone, email].filter(Boolean).join(' · ')}`);
  }
  if (dom && !GENERIC_MAIL.has(dom)) senders.push({ kind: 'domain', value: dom, name: null, role: null });
  const phone = s(input.telefono, 40);
  const address = s(input.direccion, 300);
  if (phone || address || contactLines.length) {
    let notes = set.notes !== undefined ? (set.notes ?? '') : (target?.notes ?? '');
    notes = withContactLine(notes, phone, address);
    const fresh = contactLines.filter((l) => !notes.includes(l.slice(2)));
    if (fresh.length) notes = `${notes}${notes ? '\n' : ''}${/^Personas de contacto:/m.test(notes) ? '' : 'Personas de contacto:\n'}${fresh.join('\n')}`;
    if (notes !== (target?.notes ?? '')) set.notes = notes.slice(0, 6000);
  }
  // Remitentes que ya existen (de este u otro cliente) no se duplican.
  const existing = senders.length
    ? await db
        .select({ value: opsClientSenders.value, kind: opsClientSenders.kind, clientId: opsClientSenders.clientId })
        .from(opsClientSenders)
        .where(and(eq(opsClientSenders.tenantId, tenantId), inArray(opsClientSenders.value, senders.map((x) => x.value))))
    : [];
  const freshSenders = senders.filter((x) => {
    const e = existing.find((r) => r.value === x.value && r.kind === x.kind);
    if (e && e.clientId !== target?.id) warnings.push(`${x.value} ya está asociado a otra ficha: no lo repito.`);
    return !e;
  });

  if (typeof input.horas_mes === 'number' && input.horas_mes >= 0 && input.horas_mes <= 1000) set.monthlyHours = input.horas_mes ? String(input.horas_mes) : null;
  if (typeof input.activo === 'boolean' && mode === 'editar' && input.activo !== target?.active) set.active = input.activo;

  // Opción del campo «Cliente» de ClickUp con el mismo nombre (o alias), si existe y está libre.
  if (!target?.clickupOptionId) {
    const names = new Set([name || target?.name || '', ...mergedAliases].map(normText).filter(Boolean));
    const linked = new Set(clients.map((c) => c.clickupOptionId).filter(Boolean));
    const opts = Object.values(structure.clientFields).flatMap((f) => f.options);
    const opt = opts.find((o) => names.has(normText(o.label)) && !linked.has(o.id));
    if (opt) {
      set.clickupOptionId = opt.id;
      set.clickupOptionLabel = opt.label;
    } else if (mode === 'crear') {
      warnings.push('No hay opción «Cliente» en ClickUp con este nombre: añádela en ClickUp y la vinculo (o vincúlala en la ficha).');
    }
  }

  const memory = (input.memoria ?? [])
    .map((m) => ({ kind: (MEMORY_KINDS as readonly string[]).includes(s(m.tipo)) ? (s(m.tipo) as MemoryKind) : 'contexto', text: s(m.texto, 1000) }))
    .filter((m) => m.text)
    .slice(0, 15);

  const plan: ClientPlan = { mode, clientId: target?.id ?? null, name: name || target?.name || '', set, servicesAdd, servicesRemove, senders: freshSenders, memory, warnings };
  const empty = !Object.keys(set).length && !servicesAdd.length && !servicesRemove.length && !freshSenders.length && !memory.length;
  if (mode === 'editar' && empty) return { error: `No veo nada que cambiar en la ficha de ${plan.name}.${warnings.length ? ` ${warnings.join(' ')}` : ''}` };
  return { plan };
}

/** Vista previa para Telegram (HTML): lo que se va a crear o cambiar. */
export function planHtml(plan: ClientPlan, levels: LevelRow[], target: ClientWithServices | null): string {
  const e = escapeHtml;
  const cut = (t: string, n = 500) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const out: string[] = [plan.mode === 'crear' ? `🗂 <b>Nueva ficha: ${e(plan.name)}</b>` : `✏️ <b>Cambios en la ficha de ${e(plan.name)}</b>`];
  const st = plan.set;
  if (st.name && plan.mode === 'editar') out.push(`<b>Nombre:</b> ${e(st.name)}`);
  if (st.level) out.push(`<b>Nivel:</b> ${e(levels.find((l) => l.key === st.level)?.label ?? st.level)}`);
  if (st.aliases) out.push(`<b>También se le llama:</b> ${e(st.aliases.filter((a) => !(target?.aliases ?? []).includes(a)).join(', ') || st.aliases.join(', '))}`);
  if (plan.servicesAdd.length) out.push(`<b>Servicios:</b> ${plan.servicesAdd.map((x) => e(`${x.label}${x.responsibleName ? ` (${x.responsibleName})` : ''}`)).join(', ')}`);
  if (plan.servicesRemove.length) out.push(`<b>Quitar servicios:</b> ${plan.servicesRemove.map((x) => e(x.label)).join(', ')}`);
  if (st.tools) {
    const fresh = st.tools.filter((t) => !(target?.tools ?? []).some((x) => x.url === t.url && x.name === t.name));
    out.push(`<b>Webs y herramientas:</b> ${fresh.map((t) => e(`${t.name}${t.url ? ` ${t.url}` : ''}`)).join(', ')}`);
  }
  for (const f of TEXT_FIELDS) {
    if (st[f] === undefined) continue;
    out.push(`<b>${TEXT_LABEL[f]}:</b> ${st[f] ? e(cut(st[f]!)) : '<i>(vacío)</i>'}`);
  }
  if (st.monthlyHours !== undefined) out.push(`<b>Horas al mes:</b> ${st.monthlyHours ?? '—'}`);
  if (st.active !== undefined) out.push(`<b>Estado:</b> ${st.active ? 'activa' : 'desactivada'}`);
  if (plan.senders.length) out.push(`<b>Reconocer sus correos de:</b> ${plan.senders.map((x) => e(x.kind === 'domain' ? `@${x.value}` : x.value)).join(', ')}`);
  if (st.clickupOptionLabel) out.push(`<b>ClickUp:</b> vinculada a la opción «${e(st.clickupOptionLabel)}»`);
  if (plan.memory.length) out.push(`<b>Memoria:</b>\n${plan.memory.map((m) => `• (${m.kind}) ${e(cut(m.text, 200))}`).join('\n')}`);
  if (plan.warnings.length) out.push(`<i>${plan.warnings.map(e).join('\n')}</i>`);
  return out.join('\n');
}

/** Guarda el plan aprobado. Revalida lo que pudo cambiar entre la propuesta y el ✅ (nombre duplicado, opción ya usada). */
export async function applyClientPlan(tenantId: string, plan: ClientPlan, createdBy: number | null): Promise<{ ok: true; id: string; text: string } | { ok: false; text: string }> {
  const clients = await listClients(tenantId);
  const set = { ...plan.set };
  if (plan.mode === 'crear' && clients.some((c) => normText(c.name) === normText(plan.name))) return { ok: false, text: `Ya existe una ficha «${plan.name}» (creada mientras tanto).` };
  if (plan.mode === 'editar' && !clients.some((c) => c.id === plan.clientId)) return { ok: false, text: 'La ficha ya no existe.' };
  if (set.clickupOptionId && clients.some((c) => c.clickupOptionId === set.clickupOptionId && c.id !== plan.clientId)) {
    delete set.clickupOptionId;
    delete set.clickupOptionLabel;
  }
  const values = {
    ...set,
    updatedAt: new Date()
  };
  const id = await db.transaction(async (tx) => {
    let clientId = plan.clientId;
    if (plan.mode === 'crear') {
      const [row] = await tx
        .insert(opsClients)
        .values({ ...values, name: plan.name, level: set.level!, tenantId })
        .returning({ id: opsClients.id });
      clientId = row.id;
    } else {
      await tx.update(opsClients).set(values).where(and(eq(opsClients.id, clientId!), eq(opsClients.tenantId, tenantId)));
    }
    if (plan.servicesRemove.length) {
      await tx.delete(opsClientServices).where(and(eq(opsClientServices.clientId, clientId!), inArray(opsClientServices.serviceKey, plan.servicesRemove.map((x) => x.key))));
    }
    if (plan.servicesAdd.length) {
      // Si el servicio ya estaba, se actualiza el responsable solo si ahora se dice uno.
      const have = await tx.select().from(opsClientServices).where(eq(opsClientServices.clientId, clientId!));
      for (const sv of plan.servicesAdd) {
        const h = have.find((x) => x.serviceKey === sv.key);
        if (!h) await tx.insert(opsClientServices).values({ clientId: clientId!, serviceKey: sv.key, responsibleClickupId: sv.responsibleClickupId });
        else if (sv.responsibleClickupId && h.responsibleClickupId !== sv.responsibleClickupId) await tx.update(opsClientServices).set({ responsibleClickupId: sv.responsibleClickupId }).where(eq(opsClientServices.id, h.id));
      }
    }
    if (plan.senders.length) {
      await tx
        .insert(opsClientSenders)
        .values(plan.senders.map((x) => ({ tenantId, clientId: clientId!, kind: x.kind, value: x.value, name: x.name, role: x.role })))
        .onConflictDoNothing();
    }
    if (plan.memory.length) {
      await tx.insert(opsClientMemory).values(plan.memory.map((m) => ({ tenantId, clientId: clientId!, kind: m.kind, text: m.text, status: 'aceptado', sourceType: 'nota', createdBy, decidedBy: createdBy, decidedAt: new Date() })));
    }
    return clientId!;
  });
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  const link = base ? ` ${base}/dashboard/operaciones/clientes` : '';
  return { ok: true, id, text: plan.mode === 'crear' ? `Ficha de ${plan.name} creada.${link}` : `Ficha de ${plan.name} actualizada.${link}` };
}

/** Nota en la memoria de un cliente (aceptada: la ha dicho Enric y pasa por su aprobación). */
export async function addClientMemory(tenantId: string, clientId: string, kind: MemoryKind, text: string, createdBy: number | null): Promise<void> {
  await db.insert(opsClientMemory).values({ tenantId, clientId, kind, text: text.slice(0, 1000), status: 'aceptado', sourceType: 'nota', createdBy, decidedBy: createdBy, decidedAt: new Date() });
}

/** Ficha completa en texto para el agente (lectura). */
export async function clientSheetText(tenantId: string, c: ClientWithServices): Promise<string> {
  const [levels, structure, mem, senders] = await Promise.all([
    getLevels(tenantId),
    getStructure(tenantId),
    db
      .select({ kind: opsClientMemory.kind, text: opsClientMemory.text })
      .from(opsClientMemory)
      .where(and(eq(opsClientMemory.clientId, c.id), eq(opsClientMemory.status, 'aceptado')))
      .limit(30),
    db.select({ kind: opsClientSenders.kind, value: opsClientSenders.value, name: opsClientSenders.name, role: opsClientSenders.role }).from(opsClientSenders).where(eq(opsClientSenders.clientId, c.id)).limit(20)
  ]);
  const members = new Map(structure.members.map((m) => [m.id, m.username]));
  const svcLabels = new Map((await getServices(tenantId)).map((x) => [x.key, x.label]));
  return [
    `${c.name} (nivel ${levels.find((l) => l.key === c.level)?.label ?? c.level}${c.active ? '' : ', desactivada'})`,
    c.aliases.length ? `Alias: ${c.aliases.join(', ')}` : '',
    `ClickUp: ${c.clickupOptionLabel ? `opción «${c.clickupOptionLabel}»` : 'sin vincular'}`,
    `Servicios: ${c.services.map((x) => `${svcLabels.get(x.serviceKey) ?? x.serviceKey}${x.responsibleClickupId ? ` → ${members.get(x.responsibleClickupId) ?? '?'}` : ''}`).join(', ') || 'ninguno'}`,
    c.tools?.length ? `Webs y herramientas: ${c.tools.map((t) => `${t.name}${t.url ? ` ${t.url}` : ''}${t.note ? ` (${t.note})` : ''}`).join('; ')}` : '',
    ...TEXT_FIELDS.map((f) => (c[f] ? `${TEXT_LABEL[f]}: ${c[f]}` : '')),
    c.monthlyHours ? `Horas al mes: ${c.monthlyHours}` : '',
    senders.length ? `Correos que se reconocen: ${senders.map((x) => (x.kind === 'domain' ? `@${x.value}` : `${x.value}${x.name ? ` (${x.name}${x.role ? `, ${x.role}` : ''})` : ''}`)).join(', ')}` : '',
    mem.length ? `Memoria:\n${mem.map((m) => `- (${m.kind}) ${m.text}`).join('\n')}` : 'Memoria: vacía'
  ]
    .filter(Boolean)
    .join('\n');
}
