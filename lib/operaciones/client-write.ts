import 'server-only';

// Propuestas de ficha de cliente (14 nov 2026): lo que redacta la IA —el agente por Telegram o «Rellenar con IA» en la
// ficha— se convierte aquí en un PLAN validado contra los datos reales y se guarda solo cuando una persona lo aprueba.
//   - La ficha está en el núcleo (lib/core/clients.ts): datos de empresa y negocio, contactos, locales, webs y cuentas,
//     competencia y memoria. Los ajustes de Operaciones (nivel, servicios, ClickUp, horas) van por client-ops.ts.
//   - Al CREAR se pone todo lo dicho. Al EDITAR, los textos se reemplazan y las listas se suman: un contacto, local, web
//     o competidor que ya existe (mismo correo, nombre, dominio…) se completa en vez de duplicarse; quitar es explícito.
//   - Nunca contraseñas. El contrato (cuota, fechas) solo si quien propone puede verlo (dueño o administrador).
import { db } from '@/lib/db/drizzle';
import { clientAssets } from '@/lib/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import {
  ACCESS_LABEL,
  ASSET_KIND_LABEL,
  CHANNEL_LABEL,
  CONTACT_ROLE_LABEL,
  MEMORY_KINDS,
  STATUS_LABEL,
  domainOf,
  hasSecret,
  isAccess,
  isAssetKind,
  isChannel,
  isClientStatus,
  isContactRole,
  normEmail,
  normalizeUrl,
  recognizableDomain,
  type AssetKind,
  type ClientStatus,
  type MemoryKind
} from '@/lib/core/client-rules';
import {
  addMemory,
  createCoreClient,
  deleteAsset,
  deleteCompetitor,
  deleteContact,
  deleteLocation,
  getClientSheet,
  saveAsset,
  saveCompetitor,
  saveContact,
  saveLocation,
  updateCoreClient,
  ClientError,
  type AssetInput,
  type ClientContractInput,
  type ClientProfileInput,
  type ClientSheet,
  type CompetitorInput,
  type ContactInput,
  type LocationInput
} from '@/lib/core/clients';
import { getLevels, getServices, listClients, normText, type ClientWithServices, type LevelRow } from '@/lib/operaciones/clients';
import { changeServices, upsertOpsSettings } from '@/lib/operaciones/client-ops';
import { getStructure } from '@/lib/operaciones/structure';
import { escapeHtml } from '@/lib/operaciones/telegram';

export { MEMORY_KINDS };
export type { MemoryKind };

/** Lo que propone la IA (mismas claves que el prompt ops_client_fill y que las herramientas del agente). */
export type AgentClientInput = {
  nombre?: string;
  alias?: string[];
  estado?: string;
  sector?: string;
  descripcion?: string;
  razon_social?: string;
  cif?: string;
  direccion_fiscal?: string;
  negocio?: string;
  productos_servicios?: string;
  zona?: string;
  publico?: string;
  propuesta_valor?: string;
  tono_marca?: string;
  objetivos?: string;
  estrategia?: string;
  notas?: string;
  nivel?: string;
  servicios?: { servicio?: string; responsable?: string }[];
  servicios_quitar?: string[];
  horas_mes?: number;
  web?: string;
  contactos?: { nombre?: string; cargo?: string; rol?: string; email?: string; telefono?: string; whatsapp?: string; canal_preferido?: string; principal?: boolean }[];
  locales?: { nombre?: string; direccion?: string; ciudad?: string; codigo_postal?: string; provincia?: string; pais?: string; telefono?: string; horario?: string; principal?: boolean }[];
  activos?: { tipo?: string; nombre?: string; url?: string; acceso?: string; donde_accesos?: string; principal?: boolean; nota?: string }[];
  competidores?: { nombre?: string; dominio?: string; nota?: string }[];
  quitar?: { contactos?: string[]; locales?: string[]; activos?: string[]; competidores?: string[] };
  memoria?: { tipo?: string; texto?: string }[];
  contrato_servicios?: string;
  cuota_mensual?: number | null;
  contrato_inicio?: string;
  contrato_renovacion?: string;
};

type Named<T> = T & { label: string };

/** Plan ya validado (serializable: va en la acción que aprueba Enric). */
export type ClientPlan = {
  mode: 'crear' | 'editar';
  clientId: string | null;
  name: string;
  profile: ClientProfileInput;
  contract: ClientContractInput;
  ops: { level?: string; monthlyHours?: number | null; clickupOptionId?: string; clickupOptionLabel?: string };
  servicesAdd: { key: string; label: string; responsibleClickupId: string | null; responsibleName: string | null }[];
  servicesRemove: { key: string; label: string }[];
  contacts: Named<ContactInput>[];
  locations: Named<LocationInput>[];
  assets: Named<AssetInput>[];
  competitors: Named<CompetitorInput>[];
  remove: { contacts: { id: string; label: string }[]; locations: { id: string; label: string }[]; assets: { id: string; label: string }[]; competitors: { id: string; label: string }[] };
  memory: { kind: MemoryKind; text: string }[];
  warnings: string[];
};

const s = (v: unknown, max = 8000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const nn = (v: string) => normText(v).replace(/[^a-z0-9 ]/g, '').trim();
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const PROFILE_KEYS: [keyof AgentClientInput, keyof ClientProfileInput, string][] = [
  ['sector', 'sector', 'Sector'],
  ['descripcion', 'summary', 'Resumen'],
  ['razon_social', 'legalName', 'Razón social'],
  ['cif', 'taxId', 'CIF'],
  ['direccion_fiscal', 'fiscalAddress', 'Dirección fiscal'],
  ['negocio', 'business', 'Negocio'],
  ['productos_servicios', 'offerings', 'Qué vende u ofrece'],
  ['zona', 'area', 'Zona'],
  ['publico', 'audience', 'Público'],
  ['propuesta_valor', 'valueProposition', 'Propuesta de valor'],
  ['tono_marca', 'brandTone', 'Tono y marca'],
  ['objetivos', 'goals', 'Objetivos'],
  ['estrategia', 'strategy', 'Estrategia'],
  ['notas', 'notes', 'Notas']
];
export const PROFILE_LABEL = Object.fromEntries(PROFILE_KEYS.map(([, k, l]) => [k, l])) as Record<string, string>;

/**
 * Convierte la propuesta de la IA en un plan. `target` = la ficha actual al editar. `withContract` = quien propone
 * puede ver el contrato. Devuelve un error entendible si no se puede (p. ej. nombre duplicado).
 */
export async function planClientChange(
  tenantId: string,
  mode: 'crear' | 'editar',
  input: AgentClientInput,
  target: { sheet: ClientSheet; ops: ClientWithServices | null } | null,
  opts: { withContract?: boolean } = {}
): Promise<{ plan: ClientPlan } | { error: string }> {
  if (hasSecret(JSON.stringify(input))) return { error: 'En la ficha no se guardan contraseñas ni claves: quítalas y vuelve a intentarlo.' };
  const [levels, services, structure, all] = await Promise.all([getLevels(tenantId), getServices(tenantId), getStructure(tenantId), listClients(tenantId)]);
  const warnings: string[] = [];
  const sheet = target?.sheet ?? null;
  const cur = sheet?.client ?? null;
  const profile: ClientProfileInput = {};
  const contract: ClientContractInput = {};
  const ops: ClientPlan['ops'] = {};

  // Nombre y alias.
  const name = s(input.nombre, 255);
  if (mode === 'crear') {
    if (!name) return { error: 'Falta el nombre del cliente.' };
    const dup = all.find((c) => nn(c.name) === nn(name) || c.aliases.some((a) => nn(a) === nn(name)));
    if (dup) return { error: `Ya existe una ficha «${dup.name}»${dup.active ? '' : ` (${STATUS_LABEL[dup.status as ClientStatus] ?? dup.status})`}. Usa actualizar_cliente para completarla, o pregunta si es otro cliente.` };
    profile.name = name;
  } else if (name && cur && nn(name) !== nn(cur.name)) {
    const dup = all.find((c) => c.id !== cur.id && nn(c.name) === nn(name));
    if (dup) return { error: `Ya hay otra ficha llamada «${dup.name}».` };
    profile.name = name;
  }
  const webDomain = domainOf(input.web ?? input.activos?.find((a) => a.tipo === 'web')?.url);
  const curAliases = cur?.aliases ?? [];
  const newAliases = [...(input.alias ?? []).map((a) => s(a, 120)), ...(webDomain ? [webDomain] : [])].filter((a) => a && nn(a) !== nn(name || cur?.name || '') && !curAliases.some((x) => nn(x) === nn(a)));
  if (newAliases.length) profile.aliases = [...curAliases, ...new Map(newAliases.map((a) => [nn(a), a])).values()];

  // Estado.
  const estado = s(input.estado);
  if (estado && isClientStatus(estado) && estado !== cur?.status) profile.status = estado;
  else if (mode === 'crear') profile.status = 'onboarding';

  // Textos del perfil: reemplazan (el agente pasa el texto completo nuevo).
  for (const [k, col] of PROFILE_KEYS) {
    if (typeof input[k] !== 'string') continue;
    const v = s(input[k]);
    if (mode === 'crear' && !v) continue;
    if (v !== ((cur?.[col as keyof typeof cur] as string | null) ?? '')) (profile as Record<string, unknown>)[col] = v;
  }

  // Contrato (solo si quien propone puede verlo).
  const hasContract = ['contrato_servicios', 'cuota_mensual', 'contrato_inicio', 'contrato_renovacion'].some((k) => input[k as keyof AgentClientInput] !== undefined && input[k as keyof AgentClientInput] !== '' && input[k as keyof AgentClientInput] !== null);
  if (hasContract && !opts.withContract) warnings.push('Los datos del contrato solo los puede poner un administrador: no los incluyo.');
  if (hasContract && opts.withContract) {
    if (s(input.contrato_servicios)) contract.contractServices = s(input.contrato_servicios, 2000);
    if (typeof input.cuota_mensual === 'number' && input.cuota_mensual >= 0) contract.monthlyFee = input.cuota_mensual;
    for (const [k, col] of [['contrato_inicio', 'contractStart'], ['contrato_renovacion', 'contractRenewal']] as const) {
      const v = s(input[k]);
      if (v && isDate(v)) contract[col] = v;
      else if (v) warnings.push(`Fecha «${v}» no válida (AAAA-MM-DD): no la pongo.`);
    }
  }

  // Operaciones: nivel, horas, ClickUp.
  const lvlText = s(input.nivel);
  if (lvlText) {
    const q = nn(lvlText);
    const lv = levels.find((l) => nn(l.key) === q || nn(l.label) === q) ?? levels.find((l) => nn(l.label).includes(q));
    if (lv && lv.key !== target?.ops?.level) ops.level = lv.key;
    else if (!lv) warnings.push(`No reconozco el nivel «${lvlText}»: lo dejo como está.`);
  }
  if (typeof input.horas_mes === 'number' && input.horas_mes > 0 && input.horas_mes <= 1000) ops.monthlyHours = input.horas_mes;
  if (!target?.ops?.clickupOptionId) {
    const names = new Set([name || cur?.name || '', ...(profile.aliases ?? curAliases)].map(nn).filter(Boolean));
    const linked = new Set(all.map((c) => c.clickupOptionId).filter(Boolean));
    const opt = Object.values(structure.clientFields).flatMap((f) => f.options).find((o) => names.has(nn(o.label)) && !linked.has(o.id));
    if (opt) {
      ops.clickupOptionId = opt.id;
      ops.clickupOptionLabel = opt.label;
    } else if (mode === 'crear') warnings.push('No hay opción «Cliente» en ClickUp con este nombre: créala en ClickUp y vincúlala en la pestaña Operaciones.');
  }

  // Servicios.
  const active = services.filter((x) => x.active);
  const svcByText = (t: string) => {
    const q = nn(t);
    return q ? (active.find((x) => nn(x.key) === q || nn(x.label) === q) ?? active.find((x) => nn(x.label).includes(q) || q.includes(nn(x.label)))) : undefined;
  };
  const memberByText = (t: string) => {
    const q = nn(t);
    if (!q) return null;
    const m = structure.members.filter((x) => nn(x.username) === q || nn(x.username).split(' ').some((w) => w === q || w.startsWith(q)));
    return m.length === 1 ? m[0] : null;
  };
  const servicesAdd: ClientPlan['servicesAdd'] = [];
  for (const it of input.servicios ?? []) {
    const sv = svcByText(s(it.servicio, 120));
    if (!sv) {
      if (s(it.servicio)) warnings.push(`El servicio «${s(it.servicio, 60)}» no está en la lista de servicios: no lo pongo.`);
      continue;
    }
    const resp = memberByText(s(it.responsable, 120));
    if (s(it.responsable) && !resp) warnings.push(`No sé quién es «${s(it.responsable, 60)}» para ${sv.label}.`);
    const had = target?.ops?.services.find((x) => x.serviceKey === sv.key);
    if (had && (!resp || had.responsibleClickupId === resp.id)) continue;
    if (!servicesAdd.some((x) => x.key === sv.key)) servicesAdd.push({ key: sv.key, label: sv.label, responsibleClickupId: resp?.id ?? null, responsibleName: resp?.username ?? null });
  }
  const servicesRemove: ClientPlan['servicesRemove'] = [];
  for (const tx of input.servicios_quitar ?? []) {
    const sv = services.find((x) => nn(x.key) === nn(s(tx)) || nn(x.label) === nn(s(tx)));
    if (sv && target?.ops?.services.some((x) => x.serviceKey === sv.key)) servicesRemove.push({ key: sv.key, label: sv.label });
  }

  // Contactos: se completan los que ya existen (mismo correo o nombre).
  const contacts: ClientPlan['contacts'] = [];
  for (const c of input.contactos ?? []) {
    const email = s(c.email) ? normEmail(c.email) : null;
    if (s(c.email) && !email) warnings.push(`El correo «${s(c.email, 80)}» no es válido.`);
    const nm = s(c.nombre, 255);
    if (!nm && !email) continue;
    const ex = sheet?.contacts.find((x) => (email && x.email === email) || (nm && nn(x.name) === nn(nm)));
    const role = s(c.rol);
    const ch = s(c.canal_preferido);
    const item: ContactInput = { id: ex?.id ?? null };
    if (nm && nm !== ex?.name) item.name = nm;
    if (s(c.cargo) && s(c.cargo) !== ex?.jobTitle) item.jobTitle = s(c.cargo, 120);
    if (role && isContactRole(role) && role !== ex?.role) item.role = role;
    if (email && email !== ex?.email) item.email = email;
    if (s(c.telefono) && s(c.telefono) !== ex?.phone) item.phone = s(c.telefono, 40);
    if (s(c.whatsapp) && s(c.whatsapp) !== ex?.whatsapp) item.whatsapp = s(c.whatsapp, 40);
    if (ch && isChannel(ch) && ch !== ex?.preferredChannel) item.preferredChannel = ch;
    if (c.principal === true && !ex?.isPrimary) item.isPrimary = true;
    if (Object.keys(item).length > 1) contacts.push({ ...item, label: nm || ex?.name || email || '' });
  }

  // Locales.
  const locations: ClientPlan['locations'] = [];
  for (const l of input.locales ?? []) {
    const nm = s(l.nombre, 255);
    const addr = s(l.direccion, 500);
    if (!nm && !addr && !s(l.ciudad) && !s(l.telefono)) continue;
    const ex = sheet?.locations.find((x) => (nm && x.name && nn(x.name) === nn(nm)) || (addr && x.address && nn(x.address) === nn(addr)));
    const item: LocationInput = { id: ex?.id ?? null };
    const map: [keyof typeof l, keyof LocationInput, number][] = [
      ['nombre', 'name', 255],
      ['direccion', 'address', 500],
      ['ciudad', 'city', 120],
      ['codigo_postal', 'postalCode', 20],
      ['provincia', 'region', 120],
      ['pais', 'country', 80],
      ['telefono', 'phone', 40],
      ['horario', 'hours', 1000]
    ];
    for (const [k, col, max] of map) {
      const v = s(l[k] as string, max);
      if (v && v !== (ex?.[col as keyof typeof ex] ?? '')) (item as Record<string, unknown>)[col] = v;
    }
    if (l.principal === true && !ex?.isPrimary) item.isPrimary = true;
    if (Object.keys(item).length > 1) locations.push({ ...item, label: [nm, addr, s(l.ciudad)].filter(Boolean).join(', ') || ex?.name || 'Local' });
  }

  // Webs y cuentas. La web principal reconoce los correos de su dominio si nadie más lo tiene.
  const taken = new Map(
    (await db.select({ d: clientAssets.emailDomain, clientId: clientAssets.clientId }).from(clientAssets).where(and(eq(clientAssets.tenantId, tenantId), isNotNull(clientAssets.emailDomain)))).map((r) => [r.d!, r.clientId])
  );
  const rawAssets = [...(input.web ? [{ tipo: 'web', url: input.web, principal: true }] : []), ...(input.activos ?? [])];
  const assets: ClientPlan['assets'] = [];
  for (const a of rawAssets) {
    const kind = s(a.tipo) as AssetKind;
    if (!isAssetKind(kind)) {
      if (s(a.tipo)) warnings.push(`Tipo de cuenta «${s(a.tipo, 40)}» no reconocido: lo guardo como «Otro».`);
    }
    const k: AssetKind = isAssetKind(kind) ? kind : 'otro';
    const url = s(a.url, 500) ? normalizeUrl(s(a.url, 500)) : '';
    const label = s(a.nombre, 255);
    if (!url && !label) continue;
    const dom = domainOf(url);
    const ex = sheet?.assets.find((x) => x.kind === k && ((url && x.value && (x.value === url || (dom && domainOf(x.value) === dom))) || (!url && label && x.label && nn(x.label) === nn(label))));
    if (assets.some((x) => x.kind === k && x.value === url && url)) continue;
    const item: AssetInput = { id: ex?.id ?? null, kind: k };
    if (url && url !== ex?.value) item.value = url;
    if (label && label !== ex?.label) item.label = label;
    const acc = s(a.acceso);
    if (acc && isAccess(acc) && acc !== ex?.access) item.access = acc;
    if (s(a.donde_accesos) && s(a.donde_accesos) !== ex?.accessNotes) item.accessNotes = s(a.donde_accesos, 1000);
    if (s(a.nota) && s(a.nota) !== ex?.notes) item.notes = s(a.nota, 2000);
    if (a.principal === true && !ex?.isPrimary) item.isPrimary = true;
    if ((k === 'web' || k === 'dominio') && !ex?.emailDomain) {
      const rd = recognizableDomain(url);
      const owner = rd ? taken.get(rd) : undefined;
      if (rd && (!owner || owner === sheet?.client.id)) {
        item.recognizeEmails = true;
        taken.set(rd, sheet?.client.id ?? 'nuevo');
      } else if (rd && owner) warnings.push(`Los correos de ${rd} ya son de otro cliente: esta ficha no los reconocerá.`);
    }
    if (Object.keys(item).length > 2 || !ex) assets.push({ ...item, label: `${ASSET_KIND_LABEL[k]}${label ? ` «${label}»` : ''}${url ? ` ${url}` : ''}` });
  }

  // Competencia.
  const competitors: ClientPlan['competitors'] = [];
  for (const c of input.competidores ?? []) {
    const nm = s(c.nombre, 255);
    const dom = s(c.dominio) ? domainOf(c.dominio) : null;
    if (!nm && !dom) continue;
    const ex = sheet?.competitors.find((x) => (dom && x.domain === dom) || (nm && nn(x.name) === nn(nm)));
    const item: CompetitorInput = { id: ex?.id ?? null, source: 'agente' };
    if (nm && nm !== ex?.name) item.name = nm;
    if (dom && dom !== ex?.domain) item.domain = dom;
    if (s(c.nota) && s(c.nota) !== ex?.notes) item.notes = s(c.nota, 2000);
    if (Object.keys(item).length > 2) competitors.push({ ...item, label: [nm || ex?.name, dom].filter(Boolean).join(' · ') });
  }

  // Quitar (solo al editar, por nombre, correo, dominio o URL).
  const remove: ClientPlan['remove'] = { contacts: [], locations: [], assets: [], competitors: [] };
  if (sheet && input.quitar) {
    for (const q of input.quitar.contactos ?? []) {
      const x = sheet.contacts.find((c) => nn(c.name) === nn(q) || c.email === normEmail(q));
      if (x) remove.contacts.push({ id: x.id, label: x.name });
    }
    for (const q of input.quitar.locales ?? []) {
      const x = sheet.locations.find((c) => (c.name && nn(c.name) === nn(q)) || (c.address && nn(c.address) === nn(q)));
      if (x) remove.locations.push({ id: x.id, label: x.name || x.address || 'Local' });
    }
    for (const q of input.quitar.activos ?? []) {
      const d = domainOf(q);
      const x = sheet.assets.find((c) => (c.label && nn(c.label) === nn(q)) || c.value === q || (d && domainOf(c.value) === d));
      if (x) remove.assets.push({ id: x.id, label: `${ASSET_KIND_LABEL[x.kind as AssetKind] ?? x.kind}${x.value ? ` ${x.value}` : ''}` });
    }
    for (const q of input.quitar.competidores ?? []) {
      const d = domainOf(q);
      const x = sheet.competitors.find((c) => nn(c.name) === nn(q) || (d && c.domain === d));
      if (x) remove.competitors.push({ id: x.id, label: x.name });
    }
  }

  const memory = (input.memoria ?? [])
    .map((m) => ({ kind: ((MEMORY_KINDS as readonly string[]).includes(s(m.tipo)) ? s(m.tipo) : 'contexto') as MemoryKind, text: s(m.texto, 1000) }))
    .filter((m) => m.text && !sheet?.memory.some((x) => nn(x.text) === nn(m.text)))
    .slice(0, 15);

  const plan: ClientPlan = { mode, clientId: cur?.id ?? null, name: name || cur?.name || '', profile, contract, ops, servicesAdd, servicesRemove, contacts, locations, assets, competitors, remove, memory, warnings };
  if (mode === 'editar' && isEmptyPlan(plan)) return { error: `No veo nada que cambiar en la ficha de ${plan.name}.${warnings.length ? ` ${warnings.join(' ')}` : ''}` };
  return { plan };
}

export function isEmptyPlan(p: ClientPlan): boolean {
  return (
    !Object.keys(p.profile).length &&
    !Object.keys(p.contract).length &&
    !Object.keys(p.ops).length &&
    !p.servicesAdd.length &&
    !p.servicesRemove.length &&
    !p.contacts.length &&
    !p.locations.length &&
    !p.assets.length &&
    !p.competitors.length &&
    !p.memory.length &&
    !Object.values(p.remove).some((x) => x.length)
  );
}

export type PlanLine = { section: string; label: string; value: string; kind?: 'add' | 'change' | 'remove' };

/** Líneas legibles del plan (para Telegram y para la vista previa en la web). */
export function planLines(plan: ClientPlan, levels: LevelRow[]): PlanLine[] {
  const out: PlanLine[] = [];
  const p = plan.profile;
  if (p.name && plan.mode === 'editar') out.push({ section: 'Empresa', label: 'Nombre', value: p.name, kind: 'change' });
  if (p.status) out.push({ section: 'Empresa', label: 'Estado', value: STATUS_LABEL[p.status as ClientStatus] ?? p.status, kind: 'change' });
  if (p.aliases) out.push({ section: 'Empresa', label: 'También se le llama', value: p.aliases.join(', ') });
  for (const [, col, label] of PROFILE_KEYS) {
    const v = (p as Record<string, string | undefined>)[col];
    if (v !== undefined) out.push({ section: 'Empresa', label, value: v || '(vacío)', kind: plan.mode === 'editar' ? 'change' : 'add' });
  }
  const c = plan.contract;
  if (Object.keys(c).length) out.push({ section: 'Contrato', label: 'Contrato', value: [c.contractServices, c.monthlyFee != null ? `${c.monthlyFee} €/mes` : '', c.contractStart ? `desde ${c.contractStart}` : '', c.contractRenewal ? `renueva ${c.contractRenewal}` : ''].filter(Boolean).join(' · ') });
  if (plan.ops.level) out.push({ section: 'Operaciones', label: 'Nivel', value: levels.find((l) => l.key === plan.ops.level)?.label ?? plan.ops.level, kind: 'change' });
  if (plan.ops.monthlyHours) out.push({ section: 'Operaciones', label: 'Horas al mes', value: String(plan.ops.monthlyHours) });
  if (plan.ops.clickupOptionLabel) out.push({ section: 'Operaciones', label: 'ClickUp', value: `vinculada a la opción «${plan.ops.clickupOptionLabel}»` });
  if (plan.servicesAdd.length) out.push({ section: 'Operaciones', label: 'Servicios', value: plan.servicesAdd.map((x) => `${x.label}${x.responsibleName ? ` (${x.responsibleName})` : ''}`).join(', '), kind: 'add' });
  if (plan.servicesRemove.length) out.push({ section: 'Operaciones', label: 'Quitar servicios', value: plan.servicesRemove.map((x) => x.label).join(', '), kind: 'remove' });
  for (const x of plan.contacts)
    out.push({
      section: 'Contactos',
      label: x.id ? `Completar ${x.label}` : x.label,
      value: [x.jobTitle, x.role ? CONTACT_ROLE_LABEL[x.role as keyof typeof CONTACT_ROLE_LABEL] : '', x.email, x.phone ? `tel. ${x.phone}` : '', x.whatsapp ? `WhatsApp ${x.whatsapp}` : '', x.preferredChannel ? `prefiere ${CHANNEL_LABEL[x.preferredChannel as keyof typeof CHANNEL_LABEL]}` : '', x.isPrimary ? 'principal' : ''].filter(Boolean).join(' · '),
      kind: x.id ? 'change' : 'add'
    });
  for (const x of plan.locations) out.push({ section: 'Locales', label: x.id ? `Completar ${x.label}` : x.label, value: [x.postalCode, x.region, x.country, x.phone ? `tel. ${x.phone}` : '', x.hours].filter(Boolean).join(' · '), kind: x.id ? 'change' : 'add' });
  for (const x of plan.assets) out.push({ section: 'Webs y cuentas', label: x.id ? `Completar ${x.label}` : x.label, value: [x.access ? ACCESS_LABEL[x.access as keyof typeof ACCESS_LABEL] : '', x.accessNotes ? `accesos: ${x.accessNotes}` : '', x.recognizeEmails ? 'reconoce sus correos' : '', x.notes].filter(Boolean).join(' · '), kind: x.id ? 'change' : 'add' });
  for (const x of plan.competitors) out.push({ section: 'Competencia', label: x.label, value: x.notes ?? '', kind: x.id ? 'change' : 'add' });
  for (const [k, label] of [['contacts', 'Contactos'], ['locations', 'Locales'], ['assets', 'Webs y cuentas'], ['competitors', 'Competencia']] as const)
    for (const x of plan.remove[k]) out.push({ section: label, label: `Quitar ${x.label}`, value: '', kind: 'remove' });
  for (const m of plan.memory) out.push({ section: 'Memoria', label: m.kind, value: m.text, kind: 'add' });
  return out;
}

/** Vista previa para Telegram (HTML). */
export function planHtml(plan: ClientPlan, levels: LevelRow[]): string {
  const e = escapeHtml;
  const cut = (t: string, n = 400) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = planLines(plan, levels);
  const out: string[] = [plan.mode === 'crear' ? `🗂 <b>Nueva ficha: ${e(plan.name)}</b>` : `✏️ <b>Cambios en la ficha de ${e(plan.name)}</b>`];
  let section = '';
  for (const l of lines) {
    if (l.section !== section) {
      section = l.section;
      out.push(`\n<u>${e(section)}</u>`);
    }
    out.push(`${l.kind === 'remove' ? '➖ ' : ''}<b>${e(l.label)}</b>${l.value ? `: ${e(cut(l.value))}` : ''}`);
  }
  if (plan.warnings.length) out.push(`\n<i>${plan.warnings.map(e).join('\n')}</i>`);
  return out.join('\n');
}

/**
 * Guarda el plan aprobado. Cada parte se guarda por separado y se revalida (correo ya usado por otro cliente, nombre
 * creado mientras tanto…): lo que falle se cuenta en el resultado sin deshacer el resto.
 */
export async function applyClientPlan(tenantId: string, plan: ClientPlan, by: number | null): Promise<{ ok: true; id: string; text: string; problems: string[] } | { ok: false; text: string }> {
  let id = plan.clientId;
  try {
    if (plan.mode === 'crear') id = await createCoreClient(tenantId, { ...plan.profile, name: plan.name }, plan.contract);
    else if (id) await updateCoreClient(tenantId, id, plan.profile, plan.contract);
    else return { ok: false, text: 'Falta la ficha.' };
  } catch (e) {
    return { ok: false, text: e instanceof ClientError ? e.userMessage : 'No se pudo guardar la ficha.' };
  }
  const problems: string[] = [];
  const step = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      problems.push(`${what}: ${e instanceof ClientError ? e.userMessage : 'error'}`);
    }
  };
  const cid = id!;
  if (Object.keys(plan.ops).length || plan.mode === 'crear')
    await step('Operaciones', () => upsertOpsSettings(tenantId, cid, { ...(plan.ops.level ? { level: plan.ops.level } : {}), ...(plan.ops.monthlyHours ? { monthlyHours: plan.ops.monthlyHours } : {}), ...(plan.ops.clickupOptionId ? { clickupOptionId: plan.ops.clickupOptionId } : {}) }));
  if (plan.servicesAdd.length || plan.servicesRemove.length)
    await step('Servicios', () => changeServices(cid, plan.servicesAdd.map((x) => ({ key: x.key, responsibleClickupId: x.responsibleClickupId })), plan.servicesRemove.map((x) => x.key)));
  for (const { label, ...x } of plan.contacts) await step(`Contacto ${label}`, () => saveContact(tenantId, cid, x));
  for (const { label, ...x } of plan.locations) await step(`Local ${label}`, () => saveLocation(tenantId, cid, x));
  for (const { label, ...x } of plan.assets) await step(label, () => saveAsset(tenantId, cid, x));
  for (const { label, ...x } of plan.competitors) await step(`Competidor ${label}`, () => saveCompetitor(tenantId, cid, x));
  for (const x of plan.remove.contacts) await step(`Quitar ${x.label}`, () => deleteContact(tenantId, x.id));
  for (const x of plan.remove.locations) await step(`Quitar ${x.label}`, () => deleteLocation(tenantId, x.id));
  for (const x of plan.remove.assets) await step(`Quitar ${x.label}`, () => deleteAsset(tenantId, x.id));
  for (const x of plan.remove.competitors) await step(`Quitar ${x.label}`, () => deleteCompetitor(tenantId, x.id));
  for (const m of plan.memory) await step('Memoria', () => addMemory(tenantId, cid, { kind: m.kind, text: m.text, status: 'aceptado', sourceType: 'agente', by }));
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  const link = base ? ` ${base}/dashboard/clientes/${cid}` : '';
  const head = plan.mode === 'crear' ? `Ficha de ${plan.name} creada.${link}` : `Ficha de ${plan.name} actualizada.${link}`;
  return { ok: true, id: cid, text: problems.length ? `${head}\nNo se pudo: ${problems.join('; ')}` : head, problems };
}

/** La ficha y sus ajustes para planificar una edición. */
export async function loadTarget(tenantId: string, clientId: string): Promise<{ sheet: ClientSheet; ops: ClientWithServices | null } | null> {
  const sheet = await getClientSheet(tenantId, clientId);
  if (!sheet) return null;
  const ops = (await listClients(tenantId)).find((c) => c.id === clientId) ?? null;
  return { sheet, ops };
}

/** Lo que Operaciones añade a la ficha en texto (nivel, servicios, ClickUp). */
export async function opsSheetText(tenantId: string, c: ClientWithServices): Promise<string> {
  const [levels, services, structure] = await Promise.all([getLevels(tenantId), getServices(tenantId), getStructure(tenantId)]);
  const members = new Map(structure.members.map((m) => [m.id, m.username]));
  const labels = new Map(services.map((x) => [x.key, x.label]));
  return [
    `Operaciones: nivel ${levels.find((l) => l.key === c.level)?.label ?? c.level}; ClickUp ${c.clickupOptionLabel ? `opción «${c.clickupOptionLabel}»` : 'sin vincular'}${c.monthlyHours ? `; ${c.monthlyHours} h/mes` : ''}`,
    `Servicios: ${c.services.map((x) => `${labels.get(x.serviceKey) ?? x.serviceKey}${x.responsibleClickupId ? ` → ${members.get(x.responsibleClickupId) ?? '?'}` : ''}`).join(', ') || 'ninguno'}`
  ].join('\n');
}
