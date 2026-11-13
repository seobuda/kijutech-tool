import 'server-only';

// Lo que Operaciones pone al servicio de los agentes (13 nov 2026), publicado en el registro del núcleo
// (lib/core/capabilities.ts) para que el módulo Agentes lo use sin importar Operaciones:
//   - Herramientas de LECTURA (se ejecutan al momento): estado del equipo, tareas de una persona, jornada, lo que espera de
//     Enric, ficha de un cliente, encargos recientes, gasto de IA y servidor, informe de la semana, calendario.
//   - Herramientas de CAMBIO (crear encargo, reasignar, mover fecha, comentar, apuntar una ausencia): pasan por el MOTOR DE
//     ACCIONES (tipo «agent_tool»). Con autonomía «con tu aprobación» (por defecto) se envía la propuesta a Enric con
//     ✅ Hacerlo / ✖️ Descartar; en «autónomo» se hace y queda registrado. La autonomía es por herramienta.
//   - Salida por Telegram para el agente (texto, nota de voz, «escribiendo…» y aviso fiable al dueño).
import { randomUUID } from 'crypto';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsRequests, opsSettings, roles, userRoles, users } from '@/lib/db/schema';
import { getPrompt } from '@/lib/ai/gateway';
import { registerClientDeleteGuard, registerTools, setEmailOutbound, setTelegramOutbound, type AgentTool, type ToolContext, type ToolResult } from '@/lib/core/capabilities';
import { decideAction, getAction, recordAction, type Autonomy } from '@/lib/operaciones/agent-actions';
import { getCalendar, saveCalendar, validateEntry, KIND_LABEL, type CalendarEntry } from '@/lib/operaciones/calendar';
import { findClientInText, getLevels, listClients, normText, type ClientWithServices } from '@/lib/operaciones/clients';
import { applyClientPlan, loadTarget, MEMORY_KINDS, opsSheetText, planClientChange, planHtml, type AgentClientInput, type ClientPlan, type MemoryKind } from '@/lib/operaciones/client-write';
import { addMemory, ClientError, getClientSheet, sheetText } from '@/lib/core/clients';
import { getInbox, waitLabel } from '@/lib/operaciones/inbox';
import { getCurrentDays, todayIn } from '@/lib/operaciones/jornada';
import { enqueueNotification } from '@/lib/operaciones/notifications';
import { enqueueOutbox } from '@/lib/operaciones/outbox';
import { getPendingEmailProposals } from '@/lib/operaciones/owner-queue';
import { NOTE_PROMPT_KEY, proposeRequests } from '@/lib/operaciones/request-proposer';
import { getStructure, validClient } from '@/lib/operaciones/structure';
import { syncToClickUp } from '@/lib/operaciones/sync';
import { decodeBotToken, getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { clampMessage, escapeHtml, htmlToPlain, tg, tgSendVoice } from '@/lib/operaciones/telegram';
import { getTeamToday } from '@/lib/operaciones/team-today';
import type { ProposalItem } from '@/lib/operaciones/note-types';

const TZ = 'Europe/Madrid';
const MAX_LIST = 25;
const ok = (content: string): ToolResult => ({ ok: true, content });
const fail = (content: string): ToolResult => ({ ok: false, content });
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// --- Búsquedas comunes -----------------------------------------------------------------------------

async function findMember(tenantId: string, name: string) {
  const members = (await getStructure(tenantId)).members;
  const q = normText(name);
  if (!q) return { member: null, options: members.map((m) => m.username) };
  const exact = members.filter((m) => normText(m.username) === q);
  if (exact.length === 1) return { member: exact[0], options: [] };
  const partial = members.filter((m) => normText(m.username).split(' ').some((w) => w.startsWith(q)) || normText(m.username).includes(q));
  return partial.length === 1 ? { member: partial[0], options: [] } : { member: null, options: (partial.length ? partial : members).map((m) => m.username) };
}

type FoundTask = { taskId: string; title: string; url: string | null; assigneeIds: string[]; requestId: string | null };

/** Tarea por su nombre: primero encargos abiertos de la herramienta, luego las tareas de hoy y vencidas de ClickUp. */
async function findTask(tenantId: string, text: string): Promise<{ task: FoundTask | null; options: string[] }> {
  const q = normText(text);
  const reqs = await db
    .select()
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.status, 'creado'), notInArray(opsRequests.workStatus, ['completado'])))
    .orderBy(desc(opsRequests.createdAt))
    .limit(300);
  const fromReqs: FoundTask[] = reqs
    .filter((r) => r.clickupTaskId && normText(r.title).includes(q))
    .map((r) => ({ taskId: r.clickupTaskId!, title: r.title, url: r.clickupTaskUrl, assigneeIds: r.assigneeClickupId ? [r.assigneeClickupId] : [], requestId: r.id }));
  let found = fromReqs;
  if (!found.length) {
    try {
      const team = await getTeamToday(tenantId);
      const seen = new Set<string>();
      found = team.members
        .flatMap((m) => [...m.today, ...m.overdue])
        .filter((t) => normText(t.name).includes(q) && !seen.has(t.id) && (seen.add(t.id), true))
        .map((t) => ({ taskId: t.id, title: t.name, url: t.url, assigneeIds: t.assigneeIds.map(String), requestId: null }));
    } catch {
      /* sin ClickUp: solo encargos */
    }
  }
  if (found.length === 1) return { task: found[0], options: [] };
  return { task: null, options: found.slice(0, 8).map((t) => t.title) };
}

// --- Autonomía por herramienta y propuestas ----------------------------------------------------------

const autonomyKey = (tool: string) => `agent_autonomy:tool:${tool}`;

export async function getToolAutonomy(tenantId: string, tool: string): Promise<Autonomy> {
  const [r] = await db.select({ value: opsSettings.value }).from(opsSettings).where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, autonomyKey(tool)))).limit(1);
  return r?.value === 'autonomo' || r?.value === 'sombra' ? r.value : 'aprobacion';
}

export async function setToolAutonomy(tenantId: string, tool: string, level: Autonomy): Promise<void> {
  await db
    .insert(opsSettings)
    .values({ tenantId, key: autonomyKey(tool), value: level })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value: level, updatedAt: new Date() } });
}

type Executor = (tenantId: string, input: Record<string, unknown>, by: string) => Promise<ToolResult>;
const EXECUTORS: Record<string, Executor> = {};

/** Herramienta de cambio: prepara la propuesta (texto legible + datos ya resueltos) y la ejecuta o la manda a aprobar. */
async function proposeOrRun(ctx: ToolContext, tool: string, summaryHtml: string, data: Record<string, unknown>): Promise<ToolResult> {
  const autonomy = await getToolAutonomy(ctx.tenantId, tool);
  const exec = EXECUTORS[tool];
  if (autonomy === 'autonomo') {
    const res = await exec(ctx.tenantId, data, `Agente (${ctx.agentKey})`);
    await recordAction({
      tenantId: ctx.tenantId,
      kind: 'agent_tool',
      status: 'auto',
      autonomy,
      summary: htmlToPlain(summaryHtml).slice(0, 480),
      proposal: { tool, data, agent: ctx.agentKey, requestedBy: ctx.actor.name },
      final: { result: res.content },
      decidedVia: 'agente',
      dedupeKey: `agent_tool:${randomUUID()}`
    });
    return res;
  }
  const action = await recordAction({
    tenantId: ctx.tenantId,
    kind: 'agent_tool',
    status: autonomy === 'sombra' ? 'sombra' : 'propuesto',
    autonomy,
    summary: htmlToPlain(summaryHtml).slice(0, 480),
    proposal: { tool, data, agent: ctx.agentKey, requestedBy: ctx.actor.name, conversationId: ctx.conversationId },
    dedupeKey: `agent_tool:${randomUUID()}`
  });
  if (!action) return fail('No se pudo registrar la propuesta.');
  if (autonomy === 'sombra') return ok('Modo sombra: la acción queda anotada para medir, pero no se ejecuta ni se pide aprobación. Díselo a quien te habla.');
  const buttons = [[{ text: '✅ Hacerlo', data: `at:ok:${action.id}` }, { text: '✖️ Descartar', data: `at:no:${action.id}` }]];
  // Conversación por Telegram con el dueño: la propuesta va dentro de la respuesta del agente (un solo mensaje).
  if (ctx.channel === 'telegram' && ctx.actor.isOwner) {
    return {
      ok: true,
      proposed: true,
      card: { html: clampMessage(summaryHtml), buttons },
      content:
        'Propuesta preparada: se enseña a Enric justo debajo de tu respuesta, con los botones ✅ Hacerlo / ✖️ Descartar. No está hecha todavía. No repitas su contenido: di en una o dos frases qué le propones y, si falta algo importante, pregúntalo.'
    };
  }
  const owner = await getOwnerMember(ctx.tenantId);
  if (!owner) return fail('No hay dueño con Telegram vinculado para aprobar.');
  await enqueueNotification({
    tenantId: ctx.tenantId,
    kind: 'digest',
    dedupeKey: `at:prop:${action.id}`,
    forClickupUserId: owner.clickupUserId,
    forName: owner.username,
    payload: {
      text: clampMessage(`🤖 <b>Propuesta del agente</b>\n${summaryHtml}`),
      toOwner: true,
      buttons
    }
  });
  return { ok: true, proposed: true, content: `Propuesta enviada a ${owner.username} con los botones ✅ Hacerlo / ✖️ Descartar. No está hecha todavía: dilo así.` };
}

/** Botones at:ok/at:no (solo el dueño). Devuelve el texto de respuesta para el botón y la línea para el mensaje. */
export const AGENT_TOOL_CALLBACK_RE = /^at:(ok|no):([0-9a-f-]{36})$/;

export async function decideAgentTool(tenantId: string, actionId: string, approve: boolean, byName: string): Promise<{ answer: string; line: string }> {
  const action = await getAction(tenantId, actionId);
  if (!action || action.kind !== 'agent_tool') return { answer: 'Esta propuesta ya no existe.', line: '' };
  if (action.status !== 'propuesto') return { answer: 'Esta propuesta ya estaba decidida.', line: '' };
  const p = action.proposal as { tool: string; data: Record<string, unknown> };
  if (!approve) {
    await decideAction(tenantId, actionId, { status: 'rechazado', via: 'telegram', byName });
    return { answer: 'Descartada.', line: '✖️ Descartada' };
  }
  const exec = EXECUTORS[p.tool];
  if (!exec) return { answer: 'Esa acción ya no está disponible.', line: '' };
  const decided = await decideAction(tenantId, actionId, { status: 'aprobado', via: 'telegram', byName });
  if (!decided) return { answer: 'Esta propuesta ya estaba decidida.', line: '' };
  const res = await exec(tenantId, p.data, byName);
  return { answer: res.ok ? '✅ Hecho.' : 'No se pudo hacer.', line: `${res.ok ? '✅' : '⚠️'} ${res.content}` };
}

// --- Herramientas de lectura ---------------------------------------------------------------------

const estadoEquipo: AgentTool = {
  name: 'estado_equipo',
  module: 'operaciones',
  title: 'Estado del equipo hoy',
  description: 'Cómo está hoy cada persona del equipo: jornada (trabajando, en pausa, ausente, sin empezar), con qué tarea, y cuántas tareas tiene para hoy y vencidas. Úsala para preguntas del tipo «¿cómo va el equipo?», «¿quién no ha fichado?».',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const [days, team, owner] = await Promise.all([getCurrentDays(ctx.tenantId), getTeamToday(ctx.tenantId).catch(() => null), getOwnerMember(ctx.tenantId)]);
    const lines: string[] = [];
    for (const m of team?.members ?? []) {
      const d = days.get(m.member.id);
      const st = d ? `${d.state.status}${d.state.activeTask ? ` (con «${d.state.activeTask.name}»)` : ''}` : 'sin ficha';
      lines.push(`- ${m.member.username}${m.member.id === owner?.clickupUserId ? ' (Enric, dueño)' : ''}: jornada ${st}; ${m.today.length} tareas hoy, ${m.overdue.length} vencidas`);
    }
    if (!lines.length) for (const [, d] of days) lines.push(`- ${d.person.name}: jornada ${d.state.status}`);
    return ok(lines.join('\n') || 'Sin datos del equipo.');
  }
};

const tareasPersona: AgentTool = {
  name: 'tareas_de_persona',
  module: 'operaciones',
  title: 'Tareas de una persona',
  description: 'Lista las tareas de hoy y vencidas de una persona del equipo (de ClickUp), con su enlace.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { persona: { type: 'string', description: 'Nombre de la persona (vale el nombre de pila)' } }, required: ['persona'], additionalProperties: false },
  async run(ctx, input) {
    const { member, options } = await findMember(ctx.tenantId, str(input.persona));
    if (!member) return fail(`No sé a quién te refieres. Personas: ${options.join(', ')}`);
    const team = await getTeamToday(ctx.tenantId);
    const m = team.members.find((x) => x.member.id === member.id);
    if (!m) return ok(`${member.username} no tiene tareas para hoy ni vencidas.`);
    const fmt = (t: { name: string; url: string; dueDate: number | null }) => `- ${t.name}${t.dueDate ? ` (vence ${new Date(t.dueDate).toISOString().slice(0, 10)})` : ''} ${t.url}`;
    return ok([`${member.username}:`, `Hoy (${m.today.length}):`, ...m.today.slice(0, MAX_LIST).map(fmt), `Vencidas (${m.overdue.length}):`, ...m.overdue.slice(0, MAX_LIST).map(fmt)].join('\n'));
  }
};

const pendientesDueno: AgentTool = {
  name: 'pendientes_de_enric',
  module: 'operaciones',
  title: 'Lo que espera de Enric',
  description: 'Revisiones, bloqueos escalados y respuestas a correos de clientes que esperan la decisión de Enric, con su antigüedad.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const [inbox, emails] = await Promise.all([getInbox(ctx.tenantId), getPendingEmailProposals(ctx.tenantId)]);
    const lines = [
      ...emails.map((e) => `- Correo de ${e.clientName ?? e.from}: «${e.subject}» (espera ${waitLabel(e.since)})`),
      ...inbox.map((i) => `- ${i.kind === 'review' ? 'Revisión' : 'Bloqueo'}: «${i.req.title}» (espera ${waitLabel(i.since)})`)
    ];
    return ok(lines.length ? lines.join('\n') : 'Nada espera la decisión de Enric.');
  }
};

const fichaCliente: AgentTool = {
  name: 'ficha_cliente',
  module: 'operaciones',
  title: 'Ficha de un cliente',
  description:
    'Ficha completa de un cliente: estado, empresa, negocio, objetivos y estrategia, contactos (con rol y canal preferido), locales, webs y cuentas (con su acceso), competencia, memoria, nivel, servicios con responsable y ClickUp, y qué le falta a la ficha. Léela antes de editar una ficha o de trabajar para un cliente.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { cliente: { type: 'string' } }, required: ['cliente'], additionalProperties: false },
  async run(ctx, input) {
    const { client, options } = await findClient(ctx.tenantId, str(input.cliente));
    if (!client) return fail(options.length ? `Hay varios clientes posibles: ${options.join(' | ')}. Pregunta cuál.` : 'No encuentro ese cliente.');
    const sheet = await getClientSheet(ctx.tenantId, client.id);
    if (!sheet) return fail('No encuentro ese cliente.');
    // El contrato (cuota) solo para el dueño.
    return ok(`${sheetText(sheet, { withContract: ctx.actor.isOwner })}\n${await opsSheetText(ctx.tenantId, client)}`);
  }
};

/** Cliente por nombre o alias: exacto o, si no, el único que lo contenga. */
async function findClient(tenantId: string, text: string): Promise<{ client: ClientWithServices | null; options: string[] }> {
  const clients = await listClients(tenantId);
  const q = normText(text);
  if (!q) return { client: null, options: [] };
  const hit = findClientInText(clients, text);
  if (hit) return { client: hit, options: [] };
  const partial = clients.filter((c) => normText(c.name).includes(q) || c.aliases.some((a) => normText(a).includes(q)));
  return partial.length === 1 ? { client: partial[0], options: [] } : { client: null, options: partial.slice(0, 8).map((c) => c.name) };
}

const encargosRecientes: AgentTool = {
  name: 'encargos_recientes',
  module: 'operaciones',
  title: 'Encargos recientes',
  description: 'Últimos encargos creados en la herramienta, filtrables por cliente o persona, con su estado (asignado, en curso, en revisión, completado…).',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { cliente: { type: 'string' }, persona: { type: 'string' } }, additionalProperties: false },
  async run(ctx, input) {
    const rows = await db.select().from(opsRequests).where(eq(opsRequests.tenantId, ctx.tenantId)).orderBy(desc(opsRequests.createdAt)).limit(200);
    const qc = normText(str(input.cliente));
    const qp = normText(str(input.persona));
    const list = rows.filter((r) => (!qc || normText(r.clientName ?? '').includes(qc) || normText(r.title).includes(qc)) && (!qp || normText(r.assigneeName ?? '').includes(qp))).slice(0, MAX_LIST);
    return ok(list.length ? list.map((r) => `- «${r.title}» · ${r.assigneeName ?? 'sin asignar'} · ${r.workStatus} · ${r.dueDate ?? 'sin fecha'}${r.clickupTaskUrl ? ` · ${r.clickupTaskUrl}` : ''}`).join('\n') : 'No hay encargos con ese filtro.');
  }
};

const costes: AgentTool = {
  name: 'costes_del_sistema',
  module: 'operaciones',
  title: 'Gasto de IA y servidor',
  description: 'Gasto de IA del mes y previsión frente al presupuesto (con picos y recomendaciones) y coste y capacidad del servidor de DigitalOcean.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const { getAiOverview } = await import('@/lib/operaciones/ai-watch');
    const { getInfraOverview } = await import('@/lib/operaciones/infra-watch');
    const [ai, infra] = await Promise.all([getAiOverview(ctx.tenantId), getInfraOverview(ctx.tenantId, { cachedOnly: true })]);
    const lines = [
      `IA: ${ai.mtd.toFixed(2)} $ este mes (herramienta), previsión ${ai.forecast.toFixed(2)} $ de ${ai.settings.monthly} $ de presupuesto.`,
      ...ai.spikes.map((s) => `Pico hoy en ${s.fn}: ${s.today.usd.toFixed(2)} $ (${s.reasons[0]})`),
      ...ai.recommendations.slice(0, 3).map((r) => `Recomendación IA: ${r.title}`),
      infra.data ? `Servidor: ${infra.data.mtdUsd.toFixed(2)} $ este mes, previsión ${infra.forecast?.toFixed(2)} $; memoria ${infra.data.capacity?.memUsedPctP95_24h ?? '?'} %, disco ${infra.data.capacity?.diskUsedPct ?? '?'} %.` : 'Servidor: DigitalOcean sin conectar.'
    ];
    return ok(lines.join('\n'));
  }
};

const informeSemana: AgentTool = {
  name: 'informe_semanal',
  module: 'operaciones',
  title: 'Informe de la semana',
  description: 'Resumen de la semana pasada (o de la actual si se pide): entregas y a tiempo, horas, precisión, bloqueos, clientes en alerta, agente, sistema y pendientes.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { semana: { type: 'string', enum: ['pasada', 'actual'] } }, additionalProperties: false },
  async run(ctx, input) {
    const { buildWeeklyReport, mondayOf, weeklyText } = await import('@/lib/operaciones/reports');
    const { shiftDate } = await import('@/lib/operaciones/jornada');
    const thisMonday = mondayOf(todayIn(TZ));
    const r = await buildWeeklyReport(ctx.tenantId, input.semana === 'actual' ? thisMonday : shiftDate(thisMonday, -7));
    return ok(htmlToPlain(weeklyText(r, null)));
  }
};

const calendario: AgentTool = {
  name: 'calendario_equipo',
  module: 'operaciones',
  title: 'Calendario del equipo',
  description: 'Próximos festivos, vacaciones y ausencias planificadas del equipo.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const today = todayIn(TZ);
    const members = new Map((await getStructure(ctx.tenantId)).members.map((m) => [m.id, m.username]));
    const next = (await getCalendar(ctx.tenantId)).filter((e) => e.to >= today).slice(0, MAX_LIST);
    return ok(next.length ? next.map((e) => `- ${KIND_LABEL[e.kind]} ${e.name}: ${e.from}${e.to !== e.from ? ` a ${e.to}` : ''} · ${e.users?.length ? e.users.map((u) => members.get(u) ?? u).join(', ') : 'toda la agencia'}`).join('\n') : 'Sin festivos ni ausencias próximas.');
  }
};

// --- Herramientas de cambio (con aprobación) -------------------------------------------------------

async function ownerUserId(tenantId: string): Promise<number | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.tenantId, tenantId), eq(roles.name, 'super_admin')))
    .orderBy(users.id)
    .limit(1);
  return row?.id ?? null;
}

const crearEncargo: AgentTool = {
  name: 'crear_encargo',
  module: 'operaciones',
  title: 'Crear encargos',
  description:
    'Crea uno o varios encargos (tareas de ClickUp con aviso a la persona) a partir de lo que pide quien te habla. Pasa en «texto» la petición completa en lenguaje natural, con persona, cliente y fecha si los dijo: el sistema elige lista, cliente, responsable y fecha con las fichas. Si falta algo importante, pregunta antes de usarla.',
  risk: 'cambio',
  inputSchema: {
    type: 'object',
    properties: { texto: { type: 'string', description: 'La petición completa, tal como la diría Enric' }, cliente: { type: 'string', description: 'Cliente, si se sabe' } },
    required: ['texto'],
    additionalProperties: false
  },
  async run(ctx, input) {
    const text = str(input.texto, 4000);
    if (!text) return fail('Falta el texto del encargo.');
    const structure = await getStructure(ctx.tenantId);
    const clients = await listClients(ctx.tenantId);
    const client = findClientInText(clients, `${str(input.cliente)} ${text}`);
    const spaceId = client?.usualSpaceId ?? structure.spaces.find((s) => s.selected && s.lists.length)?.id;
    const space = structure.spaces.find((s) => s.id === spaceId);
    if (!space) return fail('No sé en qué espacio de ClickUp crearlo: dile a Enric que complete la ficha del cliente con su espacio habitual.');
    const prompt = await getPrompt(NOTE_PROMPT_KEY);
    if (!prompt) return fail('El prompt de conversión de notas está desactivado.');
    const { items, notConverted } = await proposeRequests(ctx.tenantId, { text, spaceId: space.id, spaceName: space.name, assigneeClickupId: null, assigneeName: null }, prompt);
    const valid = items.filter((i) => i.listId);
    if (!valid.length) return fail(`No he podido convertirlo en un encargo claro.${notConverted.length ? ` Sin convertir: ${notConverted.join('; ')}` : ''} Pide más detalle.`);
    const lists = new Map(structure.spaces.flatMap((s) => s.lists.map((l) => [l.id, l.name])));
    const summary = valid
      .map((i) => `📝 <b>${escapeHtml(i.title)}</b>\n${[lists.get(i.listId) ?? '', i.clientName ?? '', i.assigneeName || 'sin asignar', i.dueDate || 'sin fecha', i.priority === 1 ? 'urgente' : ''].filter(Boolean).map(escapeHtml).join(' · ')}`)
      .join('\n\n');
    return proposeOrRun(ctx, 'crear_encargo', summary, { items: valid, text, spaceId: space.id, requestedBy: ctx.actor.name });
  }
};
EXECUTORS.crear_encargo = async (tenantId, data, by) => {
  const items = (data.items as ProposalItem[]) ?? [];
  const createdBy = await ownerUserId(tenantId);
  if (!createdBy) return fail('No hay administrador en la cuenta.');
  const structure = await getStructure(tenantId);
  const lists = new Map(structure.spaces.flatMap((s) => s.lists.map((l) => [l.id, l.name])));
  const out: string[] = [];
  for (const item of items) {
    const [row] = await db
      .insert(opsRequests)
      .values({
        tenantId,
        createdBy,
        clickupListId: item.listId,
        clickupListName: lists.get(item.listId) ?? null,
        title: item.title,
        originalRequest: `Pedido al agente por ${String(data.requestedBy ?? by)}: ${String(data.text ?? '')}`.slice(0, 8000),
        preparedDescription: item.description,
        assigneeClickupId: item.assigneeId || null,
        assigneeName: item.assigneeName || null,
        dueDate: item.dueDate || null,
        priority: item.priority,
        ...validClient(structure, item.listId, item.clientOptionId ?? ''),
        status: 'pendiente_clickup'
      })
      .returning({ id: opsRequests.id });
    const res = await syncToClickUp(row.id, tenantId, false);
    out.push(res.ok ? `«${item.title}» creada${res.taskUrl ? ` (${res.taskUrl})` : ''}` : `«${item.title}» guardada, pero ClickUp falló: se reintenta sola`);
  }
  return ok(out.join('; '));
};

const reasignar: AgentTool = {
  name: 'reasignar_tarea',
  module: 'operaciones',
  title: 'Reasignar una tarea',
  description: 'Cambia el responsable de una tarea en ClickUp (quita a los actuales y pone a la persona nueva; la persona nueva recibe el aviso).',
  risk: 'cambio',
  inputSchema: { type: 'object', properties: { tarea: { type: 'string', description: 'Nombre (o parte) de la tarea' }, persona: { type: 'string' } }, required: ['tarea', 'persona'], additionalProperties: false },
  async run(ctx, input) {
    const { task, options } = await findTask(ctx.tenantId, str(input.tarea));
    if (!task) return fail(options.length ? `Hay varias tareas posibles: ${options.join(' | ')}. Pregunta cuál.` : 'No encuentro esa tarea entre las abiertas.');
    const { member, options: people } = await findMember(ctx.tenantId, str(input.persona));
    if (!member) return fail(`No sé a quién te refieres. Personas: ${people.join(', ')}`);
    return proposeOrRun(ctx, 'reasignar_tarea', `👤 Reasignar <b>${escapeHtml(task.title)}</b> a <b>${escapeHtml(member.username)}</b>`, { task, to: member.id, toName: member.username });
  }
};
EXECUTORS.reasignar_tarea = async (tenantId, data) => {
  const task = data.task as FoundTask;
  await enqueueOutbox({ tenantId, action: 'set_assignee', payload: { taskId: task.taskId, add: [String(data.to)], rem: task.assigneeIds.filter((a) => a !== String(data.to)) }, dedupeKey: `agt:as:${task.taskId}:${data.to}:${Date.now()}` });
  return ok(`«${task.title}» reasignada a ${String(data.toName)} (ClickUp se actualiza en segundos).`);
};

const moverFecha: AgentTool = {
  name: 'mover_fecha',
  module: 'operaciones',
  title: 'Cambiar la fecha de una tarea',
  description: 'Cambia la fecha de entrega de una tarea en ClickUp. La fecha en formato AAAA-MM-DD (calcúlala tú a partir de «mañana», «el viernes»…, con la fecha de hoy del contexto).',
  risk: 'cambio',
  inputSchema: { type: 'object', properties: { tarea: { type: 'string' }, fecha: { type: 'string', description: 'AAAA-MM-DD' } }, required: ['tarea', 'fecha'], additionalProperties: false },
  async run(ctx, input) {
    const fecha = str(input.fecha, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fail('La fecha tiene que ser AAAA-MM-DD.');
    const { task, options } = await findTask(ctx.tenantId, str(input.tarea));
    if (!task) return fail(options.length ? `Hay varias tareas posibles: ${options.join(' | ')}. Pregunta cuál.` : 'No encuentro esa tarea entre las abiertas.');
    return proposeOrRun(ctx, 'mover_fecha', `📅 Mover <b>${escapeHtml(task.title)}</b> al <b>${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}</b>`, { task, fecha });
  }
};
EXECUTORS.mover_fecha = async (tenantId, data) => {
  const task = data.task as FoundTask;
  await enqueueOutbox({ tenantId, requestId: task.requestId, action: 'set_due', payload: { taskId: task.taskId, dueYmd: String(data.fecha) }, dedupeKey: `agt:due:${task.taskId}:${data.fecha}:${Date.now()}` });
  return ok(`«${task.title}» movida al ${String(data.fecha)}.`);
};

const comentar: AgentTool = {
  name: 'comentar_tarea',
  module: 'operaciones',
  title: 'Comentar en una tarea',
  description: 'Añade un comentario a una tarea de ClickUp (por ejemplo, una instrucción o un dato que falta).',
  risk: 'cambio',
  inputSchema: { type: 'object', properties: { tarea: { type: 'string' }, texto: { type: 'string' } }, required: ['tarea', 'texto'], additionalProperties: false },
  async run(ctx, input) {
    const texto = str(input.texto, 3000);
    if (!texto) return fail('Falta el texto del comentario.');
    const { task, options } = await findTask(ctx.tenantId, str(input.tarea));
    if (!task) return fail(options.length ? `Hay varias tareas posibles: ${options.join(' | ')}. Pregunta cuál.` : 'No encuentro esa tarea entre las abiertas.');
    return proposeOrRun(ctx, 'comentar_tarea', `💬 Comentar en <b>${escapeHtml(task.title)}</b>:\n<i>${escapeHtml(texto.slice(0, 600))}</i>`, { task, texto });
  }
};
EXECUTORS.comentar_tarea = async (tenantId, data) => {
  const task = data.task as FoundTask;
  await enqueueOutbox({ tenantId, requestId: task.requestId, action: 'comment', payload: { taskId: task.taskId, text: String(data.texto) }, dedupeKey: `agt:cm:${task.taskId}:${Date.now()}` });
  return ok(`Comentario añadido en «${task.title}».`);
};

const ausencia: AgentTool = {
  name: 'apuntar_ausencia',
  module: 'operaciones',
  title: 'Apuntar vacaciones, ausencia o festivo',
  description: 'Apunta en el calendario del equipo unas vacaciones, una ausencia (médico, permiso) o un festivo, por rango de fechas AAAA-MM-DD. La jornada, los recordatorios y los plazos lo respetan.',
  risk: 'cambio',
  inputSchema: {
    type: 'object',
    properties: { tipo: { type: 'string', enum: ['vacaciones', 'ausencia', 'festivo'] }, desde: { type: 'string' }, hasta: { type: 'string' }, motivo: { type: 'string' }, persona: { type: 'string', description: 'Vacío para un festivo de toda la agencia' } },
    required: ['tipo', 'desde', 'hasta', 'motivo'],
    additionalProperties: false
  },
  async run(ctx, input) {
    let users: string[] | null = null;
    let who = 'toda la agencia';
    if (str(input.persona)) {
      const { member, options } = await findMember(ctx.tenantId, str(input.persona));
      if (!member) return fail(`No sé a quién te refieres. Personas: ${options.join(', ')}`);
      users = [member.id];
      who = member.username;
    }
    const entry = { kind: str(input.tipo) as CalendarEntry['kind'], from: str(input.desde, 10), to: str(input.hasta, 10), name: str(input.motivo, 120), users };
    const err = validateEntry(entry);
    if (err) return fail(err);
    return proposeOrRun(ctx, 'apuntar_ausencia', `${KIND_LABEL[entry.kind]} <b>${escapeHtml(entry.name)}</b> · ${escapeHtml(who)} · ${entry.from}${entry.to !== entry.from ? ` a ${entry.to}` : ''}`, { entry });
  }
};
EXECUTORS.apuntar_ausencia = async (tenantId, data, by) => {
  const e = data.entry as Omit<CalendarEntry, 'id' | 'createdBy' | 'createdAt'>;
  const entries = await getCalendar(tenantId);
  await saveCalendar(tenantId, [...entries, { ...e, id: randomUUID(), createdBy: by, createdAt: new Date().toISOString() }]);
  return ok(`Apuntado en el calendario: ${e.name} (${e.from}${e.to !== e.from ? ` a ${e.to}` : ''}).`);
};

// --- Fichas de cliente (14 nov 2026, sobre la ficha del núcleo) ------------------------------------------------------
// El agente redacta (de lo que cuenta Enric y, si hay web, de lo que lee en ella); client-write.ts valida contra los datos
// reales y arma el plan; se enseña en Telegram y se guarda solo con ✅ (o en autónomo). Contactos, locales, webs y
// cuentas, competencia y memoria van cada uno a su sitio.

const CLIENT_PROPS = {
  nombre: { type: 'string', description: 'Nombre comercial' },
  alias: { type: 'array', items: { type: 'string' }, description: 'Otras formas de llamarlo (marca, dominio, abreviaturas)' },
  estado: { type: 'string', enum: ['prospecto', 'onboarding', 'activo', 'pausado', 'baja'], description: 'Un cliente que empieza: onboarding' },
  sector: { type: 'string' },
  descripcion: { type: 'string', description: 'Resumen de una o dos frases' },
  razon_social: { type: 'string' },
  cif: { type: 'string' },
  direccion_fiscal: { type: 'string' },
  negocio: { type: 'string', description: 'A qué se dedica, en 2-4 frases profesionales' },
  productos_servicios: { type: 'string', description: 'Qué vende u ofrece' },
  zona: { type: 'string' },
  publico: { type: 'string' },
  propuesta_valor: { type: 'string' },
  tono_marca: { type: 'string', description: 'Cómo habla la marca y cómo hay que tratar al cliente' },
  objetivos: { type: 'string', description: 'Lo que quiere conseguir, concreto y medible si se puede' },
  estrategia: { type: 'string' },
  notas: { type: 'string' },
  nivel: { type: 'string', description: 'Nivel del cliente si se dijo' },
  servicios: { type: 'array', items: { type: 'object', properties: { servicio: { type: 'string' }, responsable: { type: 'string' } }, required: ['servicio'], additionalProperties: false } },
  horas_mes: { type: 'number' },
  web: { type: 'string', description: 'Web principal (dominio o URL)' },
  contactos: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        cargo: { type: 'string' },
        rol: { type: 'string', enum: ['decisor', 'facturacion', 'tecnico', 'marketing', 'otro'] },
        email: { type: 'string' },
        telefono: { type: 'string' },
        whatsapp: { type: 'string' },
        canal_preferido: { type: 'string', enum: ['email', 'telefono', 'whatsapp', 'otro'] },
        principal: { type: 'boolean' }
      },
      additionalProperties: false
    }
  },
  locales: {
    type: 'array',
    items: {
      type: 'object',
      properties: { nombre: { type: 'string' }, direccion: { type: 'string' }, ciudad: { type: 'string' }, codigo_postal: { type: 'string' }, provincia: { type: 'string' }, pais: { type: 'string' }, telefono: { type: 'string' }, horario: { type: 'string' }, principal: { type: 'boolean' } },
      additionalProperties: false
    },
    description: 'Tiendas, oficinas o sedes. El teléfono general del negocio va en el local principal.'
  },
  activos: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['web', 'dominio', 'search_console', 'analytics', 'business_profile', 'google_ads', 'meta', 'instagram', 'tiktok', 'linkedin', 'youtube', 'tienda', 'crm', 'otro'] },
        nombre: { type: 'string' },
        url: { type: 'string', description: 'URL o identificador (p. ej. sc-domain:cliente.com)' },
        acceso: { type: 'string', enum: ['si', 'pendiente', 'no', 'no_aplica'] },
        donde_accesos: { type: 'string', description: 'Dónde están los accesos. NUNCA la contraseña.' },
        principal: { type: 'boolean' },
        nota: { type: 'string' }
      },
      additionalProperties: false
    },
    description: 'Webs y cuentas del cliente (Search Console, Analytics, ficha de Google, Ads, redes, tienda, CRM).'
  },
  competidores: { type: 'array', items: { type: 'object', properties: { nombre: { type: 'string' }, dominio: { type: 'string' }, nota: { type: 'string' } }, additionalProperties: false } },
  memoria: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string', enum: ['preferencia', 'promesa', 'decision', 'contexto', 'restriccion'] }, texto: { type: 'string' } }, required: ['tipo', 'texto'], additionalProperties: false } },
  contrato_servicios: { type: 'string' },
  cuota_mensual: { type: 'number', description: 'Euros al mes, solo si Enric la dice' },
  contrato_inicio: { type: 'string', description: 'AAAA-MM-DD' },
  contrato_renovacion: { type: 'string', description: 'AAAA-MM-DD' }
};

const crearCliente: AgentTool = {
  name: 'crear_cliente',
  module: 'operaciones',
  title: 'Crear una ficha de cliente',
  description:
    'Crea la ficha de un cliente nuevo con todo lo que se sepa: empresa, negocio, objetivos, contactos, locales, webs y cuentas, competencia y memoria. Redacta de forma profesional y completa a partir de lo que cuenta Enric (y de su web si la has leído), sin inventar teléfonos, correos, cifras ni servicios contratados. Lo que deduces de la web, dilo («según su web…»). Se enseña a Enric con ✅ / ✖️ antes de guardarse.',
  risk: 'cambio',
  inputSchema: { type: 'object', properties: CLIENT_PROPS, required: ['nombre'], additionalProperties: false },
  async run(ctx, input) {
    const res = await planClientChange(ctx.tenantId, 'crear', input as AgentClientInput, null, { withContract: ctx.actor.isOwner });
    if ('error' in res) return fail(res.error);
    return proposeOrRun(ctx, 'crear_cliente', planHtml(res.plan, await getLevels(ctx.tenantId)), { plan: res.plan });
  }
};

const actualizarCliente: AgentTool = {
  name: 'actualizar_cliente',
  module: 'operaciones',
  title: 'Editar una ficha de cliente',
  description:
    'Completa o corrige la ficha de un cliente que ya existe. Lee antes la ficha con ficha_cliente. Pasa SOLO lo que cambia: los textos (negocio, objetivos, estrategia, notas…) se REEMPLAZAN, así que para añadir algo pasa el texto completo nuevo. Contactos, locales, webs y cuentas, competidores, servicios y memoria se SUMAN (si ya existe uno con el mismo correo, nombre o dominio, se completa). Para quitar algo usa servicios_quitar o quitar. Para dar de baja un cliente: estado «baja». Se enseña a Enric con ✅ / ✖️.',
  risk: 'cambio',
  inputSchema: {
    type: 'object',
    properties: {
      cliente: { type: 'string', description: 'Nombre actual (o alias) del cliente' },
      ...CLIENT_PROPS,
      servicios_quitar: { type: 'array', items: { type: 'string' } },
      quitar: {
        type: 'object',
        properties: { contactos: { type: 'array', items: { type: 'string' } }, locales: { type: 'array', items: { type: 'string' } }, activos: { type: 'array', items: { type: 'string' } }, competidores: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
        description: 'Lo que hay que quitar, por nombre, correo, dominio o URL'
      }
    },
    required: ['cliente'],
    additionalProperties: false
  },
  async run(ctx, input) {
    const { client, options } = await findClient(ctx.tenantId, str(input.cliente));
    if (!client) return fail(options.length ? `Hay varios clientes posibles: ${options.join(' | ')}. Pregunta cuál.` : 'No encuentro ese cliente: si es nuevo, usa crear_cliente.');
    const target = await loadTarget(ctx.tenantId, client.id);
    if (!target) return fail('No encuentro ese cliente.');
    const res = await planClientChange(ctx.tenantId, 'editar', input as AgentClientInput, target, { withContract: ctx.actor.isOwner });
    if ('error' in res) return fail(res.error);
    return proposeOrRun(ctx, 'actualizar_cliente', planHtml(res.plan, await getLevels(ctx.tenantId)), { plan: res.plan });
  }
};

const runPlan: Executor = async (tenantId, data) => {
  const res = await applyClientPlan(tenantId, data.plan as ClientPlan, await ownerUserId(tenantId));
  return res.ok ? ok(res.text) : fail(res.text);
};
EXECUTORS.crear_cliente = async (tenantId, data, by) => {
  const res = await runPlan(tenantId, data, by);
  return res.ok ? ok(`${res.content}\n¿Empezamos su onboarding? Díselo al agente.`) : res;
};
EXECUTORS.actualizar_cliente = runPlan;

const anotarMemoria: AgentTool = {
  name: 'anotar_memoria_cliente',
  module: 'operaciones',
  title: 'Anotar en la memoria de un cliente',
  description:
    'Guarda en la memoria de un cliente algo que hay que recordar siempre: una preferencia («no quiere que le llamen por la mañana»), una promesa hecha, una decisión, una restricción o contexto. Lo usan los encargos, los correos y los agentes. Una nota por llamada, en una frase clara.',
  risk: 'cambio',
  inputSchema: {
    type: 'object',
    properties: { cliente: { type: 'string' }, tipo: { type: 'string', enum: [...MEMORY_KINDS] }, texto: { type: 'string' } },
    required: ['cliente', 'tipo', 'texto'],
    additionalProperties: false
  },
  async run(ctx, input) {
    const texto = str(input.texto, 1000);
    if (!texto) return fail('Falta el texto de la nota.');
    if (/(contrase[ñn]a|password|clave de acceso)\s*[:=]/i.test(texto)) return fail('En la memoria no se guardan contraseñas.');
    const tipo = (MEMORY_KINDS as readonly string[]).includes(str(input.tipo)) ? (str(input.tipo) as MemoryKind) : 'contexto';
    const { client, options } = await findClient(ctx.tenantId, str(input.cliente));
    if (!client) return fail(options.length ? `Hay varios clientes posibles: ${options.join(' | ')}. Pregunta cuál.` : 'No encuentro ese cliente.');
    return proposeOrRun(ctx, 'anotar_memoria_cliente', `🧠 Memoria de <b>${escapeHtml(client.name)}</b> (${tipo}):\n<i>${escapeHtml(texto)}</i>`, { clientId: client.id, clientName: client.name, tipo, texto });
  }
};
EXECUTORS.anotar_memoria_cliente = async (tenantId, data) => {
  try {
    await addMemory(tenantId, String(data.clientId), { kind: String(data.tipo), text: String(data.texto), status: 'aceptado', sourceType: 'agente', by: await ownerUserId(tenantId) });
    return ok(`Anotado en la memoria de ${String(data.clientName)}.`);
  } catch (e) {
    return fail(e instanceof ClientError ? e.userMessage : 'No se pudo anotar.');
  }
};

export const OPS_AGENT_TOOLS: AgentTool[] = [estadoEquipo, tareasPersona, pendientesDueno, fichaCliente, encargosRecientes, costes, informeSemana, calendario, crearEncargo, reasignar, moverFecha, comentar, ausencia, crearCliente, actualizarCliente, anotarMemoria];

// --- Salida por Telegram para los agentes -------------------------------------------------------------

async function botToken(tenantId: string): Promise<string | null> {
  const cfg = await getTelegramConfig(tenantId);
  return cfg ? decodeBotToken(cfg) : null;
}

let registered = false;
export function registerOperacionesCapabilities(): void {
  if (registered) return;
  registered = true;
  registerTools(OPS_AGENT_TOOLS);
  // Un cliente con encargos no se borra (se le da de baja): así no se pierde el historial.
  registerClientDeleteGuard('operaciones', async (tenantId, clientId) => {
    const c = (await listClients(tenantId)).find((x) => x.id === clientId);
    if (!c?.clickupOptionId) return null;
    const { requestCountsByOption } = await import('@/lib/operaciones/clients');
    const n = (await requestCountsByOption(tenantId)).get(c.clickupOptionId) ?? 0;
    return n > 0 ? `Tiene ${n} encargo${n === 1 ? '' : 's'} en Operaciones.` : null;
  });
  setEmailOutbound({
    async reply(tenantId, input) {
      try {
        const { getEmailConfig, sendReply } = await import('@/lib/operaciones/resend');
        const cfg = await getEmailConfig(tenantId);
        if (!cfg.apiKey) return false;
        await sendReply(cfg, { to: input.to, subject: input.subject, text: input.text, inReplyTo: input.inReplyTo, references: input.references, idempotencyKey: input.key });
        return true;
      } catch (e) {
        console.error('[agente] correo:', e instanceof Error ? e.message : e);
        return false;
      }
    }
  });
  setTelegramOutbound({
    async sendText(tenantId, chatId, html, buttons) {
      const token = await botToken(tenantId);
      if (!token) return;
      const params = { chat_id: chatId, text: clampMessage(html), parse_mode: 'HTML', disable_web_page_preview: true, ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}) };
      try {
        await tg(token, 'sendMessage', params);
      } catch {
        // Si Telegram rechaza el formato, va como texto plano.
        await tg(token, 'sendMessage', { ...params, text: htmlToPlain(html).slice(0, 4000), parse_mode: undefined }).catch(() => undefined);
      }
    },
    async sendVoice(tenantId, chatId, ogg, caption) {
      const token = await botToken(tenantId);
      return token ? tgSendVoice(token, chatId, ogg, caption) : false;
    },
    async sendTyping(tenantId, chatId, action) {
      const token = await botToken(tenantId);
      if (token) await tg(token, 'sendChatAction', { chat_id: chatId, action }).catch(() => undefined);
    },
    async notifyOwner(tenantId, key, html, buttons) {
      const owner = await getOwnerMember(tenantId);
      if (!owner) return;
      await enqueueNotification({ tenantId, kind: 'digest', dedupeKey: key.slice(0, 200), forClickupUserId: owner.clickupUserId, forName: owner.username, payload: { text: clampMessage(html), toOwner: true, buttons: buttons?.length ? buttons : undefined } });
    }
  });
}

// Para las pruebas: lista de herramientas por nombre.
export const OPS_TOOL_NAMES = OPS_AGENT_TOOLS.map((t) => t.name);
export const _test = { findMember, findTask, findClient };

/** Autonomía actual de cada herramienta de cambio (pantalla Agentes). */
export async function listToolAutonomies(tenantId: string): Promise<{ name: string; title: string; autonomy: Autonomy }[]> {
  const out: { name: string; title: string; autonomy: Autonomy }[] = [];
  for (const t of OPS_AGENT_TOOLS.filter((x) => x.risk === 'cambio')) out.push({ name: t.name, title: t.title, autonomy: await getToolAutonomy(tenantId, t.name) });
  return out;
}
