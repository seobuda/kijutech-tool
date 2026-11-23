// Núcleo: registro de capacidades (13 nov 2026). Es la pieza que deja a los agentes usar lo que hacen los módulos SIN que
// un módulo importe a otro (regla de arquitectura):
//   - Herramientas: cada módulo publica las suyas (Operaciones: crear encargo, estado del equipo…; Agentes: integraciones).
//     El módulo Agentes solo habla con este registro.
//   - Entrada: un canal (el bot de Telegram de Operaciones, el buzón de correo) entrega aquí un mensaje libre y lo atiende
//     quien se haya registrado (Agentes).
//   - Salida: Operaciones registra cómo responder por Telegram; el agente lo usa sin conocer el bot.
// La conexión entre módulos se hace al arrancar en lib/app-wiring.ts (capa de aplicación, no es un módulo).
// Se guarda en globalThis porque Next.js puede cargar este archivo en varios paquetes dentro del mismo proceso.
// Este archivo no importa nada de ningún módulo.

export type ToolRisk = 'lectura' | 'cambio';
export type ChannelKind = 'telegram' | 'email' | 'web' | 'job';

export type ToolContext = {
  tenantId: string;
  agentKey: string;
  channel: ChannelKind;
  conversationId: string | null;
  actor: { name: string; isOwner: boolean; clickupUserId: string | null };
  /**
   * El turno ya leyó contenido de fuera (una web o una búsqueda): las herramientas de cambio NO se ejecutan solas
   * aunque estén en «autónomo», se proponen para aprobar (I13: un texto de una web podría pedir un cambio).
   */
  untrustedInput?: boolean;
};

export type ToolResult = {
  ok: boolean;
  /** Texto para el modelo (datos o resultado). Nunca secretos. */
  content: string;
  /** La acción quedó propuesta para aprobación. */
  proposed?: boolean;
  /**
   * Tarjeta de la propuesta para enseñarla DENTRO de la respuesta del agente (conversación por Telegram con el dueño):
   * así llega un solo mensaje con la frase del agente, la propuesta y sus botones, en vez de dos.
   */
  card?: { html: string; buttons: OutboundButton[][] };
};

export type JsonSchema = { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };

export type AgentTool = {
  name: string; // snake_case, único
  module: string; // quién la publica (operaciones, agentes, seo…)
  title: string; // para la pantalla
  description: string; // para el modelo: qué hace y cuándo usarla
  risk: ToolRisk;
  inputSchema: JsonSchema;
  /** Si existe y devuelve false, la herramienta no se ofrece (p. ej. integración sin conectar). */
  available?: (tenantId: string) => Promise<boolean>;
  run: (ctx: ToolContext, input: Record<string, unknown>) => Promise<ToolResult>;
};

export type InboundMessage = {
  tenantId: string;
  channel: 'telegram' | 'email';
  peer: string; // chat de Telegram o dirección de correo
  peerName: string;
  isOwner: boolean;
  clickupUserId: string | null;
  text: string;
  audio?: { data: ArrayBuffer; mimeType: string; seconds: number | null } | null;
  email?: { subject: string; messageId: string | null; references: string | null };
  /** Bot de departamento por el que llegó (organigrama, 20 nov 2026). Sin él, llegó por el bot principal. */
  bot?: string;
  /**
   * El mensaje responde a un aviso de encargo (jefe de Operaciones, 20 nov 2026): su id y un resumen corto (título,
   * cliente, estado, fecha y descripción). Lo rellena el módulo dueño del canal; los agentes no leen sus tablas.
   */
  replyToRequestId?: string;
  replyToSummary?: string;
};

/**
 * Bots de departamento (organigrama, 20 nov 2026). Un aviso o una respuesta puede decir por qué bot sale: si ese bot no
 * está configurado o el dueño aún no pulsó «Iniciar», sale por el bot principal (nunca se pierde).
 * SYSTEM_BOT es el del departamento de Sistema: errores, salud, gasto de IA, servidor y despliegues.
 */
export const SYSTEM_BOT = 'sistema';
export type OutboundOptions = { bot?: string | null; /** Sin sonido (Telegram disable_notification). */ silent?: boolean };

export type OutboundButton = { text: string; data: string };
export type TelegramOutbound = {
  sendText: (tenantId: string, chatId: string, html: string, buttons?: OutboundButton[][], opts?: OutboundOptions) => Promise<void>;
  sendVoice: (tenantId: string, chatId: string, ogg: Uint8Array, caption?: string, opts?: OutboundOptions) => Promise<boolean>;
  sendTyping: (tenantId: string, chatId: string, action: 'typing' | 'record_voice', opts?: OutboundOptions) => Promise<void>;
  /** Aviso fiable al dueño por la cola de avisos (para resultados que llegan más tarde, como un trabajo de subagente). */
  notifyOwner: (tenantId: string, key: string, html: string, buttons?: OutboundButton[][], opts?: OutboundOptions) => Promise<void>;
};

type Registry = {
  tools: Map<string, AgentTool>;
  inbound: Map<string, (m: InboundMessage) => Promise<boolean>>;
  telegram: TelegramOutbound | null;
};

const G = globalThis as unknown as { __kijuCapabilities?: Registry };
function reg(): Registry {
  if (!G.__kijuCapabilities) G.__kijuCapabilities = { tools: new Map(), inbound: new Map(), telegram: null };
  return G.__kijuCapabilities;
}

export function registerTools(tools: AgentTool[]): void {
  for (const t of tools) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(t.name)) throw new Error(`Nombre de herramienta no válido: ${t.name}`);
    reg().tools.set(t.name, t);
  }
}

export function listTools(): AgentTool[] {
  return [...reg().tools.values()].sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));
}

export function getTool(name: string): AgentTool | null {
  return reg().tools.get(name) ?? null;
}

/** Herramientas disponibles ahora para un tenant entre las permitidas (las de integraciones sin conectar se quitan). */
export async function availableTools(tenantId: string, allowed: string[]): Promise<AgentTool[]> {
  const out: AgentTool[] = [];
  for (const name of allowed) {
    const t = getTool(name);
    if (!t) continue;
    if (t.available && !(await t.available(tenantId).catch(() => false))) continue;
    out.push(t);
  }
  return out;
}

export function setInboundHandler(key: string, fn: (m: InboundMessage) => Promise<boolean>): void {
  reg().inbound.set(key, fn);
}

/** Entrega un mensaje libre. Devuelve true si alguien lo atendió (si no, el canal sigue con su comportamiento de siempre). */
export async function dispatchInbound(m: InboundMessage): Promise<boolean> {
  for (const fn of reg().inbound.values()) {
    if (await fn(m)) return true;
  }
  return false;
}

export function hasInboundHandler(): boolean {
  return reg().inbound.size > 0;
}

export function setTelegramOutbound(o: TelegramOutbound): void {
  reg().telegram = o;
}

export function telegramOutbound(): TelegramOutbound | null {
  return reg().telegram;
}

// --- Correo y tareas periódicas ---------------------------------------------------------------------

export type EmailOutbound = {
  /** Responde en el mismo hilo desde el buzón del agente. */
  reply: (tenantId: string, input: { to: string; subject: string; text: string; inReplyTo: string | null; references: string | null; key: string }) => Promise<boolean>;
};

const GE = globalThis as unknown as { __kijuEmail?: EmailOutbound | null; __kijuScheduled?: Map<string, (tenantId: string) => Promise<void>> };

export function setEmailOutbound(o: EmailOutbound): void {
  GE.__kijuEmail = o;
}
export function emailOutbound(): EmailOutbound | null {
  return GE.__kijuEmail ?? null;
}

/** Un módulo registra una tarea que el planificador (cada 30 s, solo el proceso líder) ejecuta por cuenta. */
export function registerScheduled(name: string, fn: (tenantId: string) => Promise<void>): void {
  if (!GE.__kijuScheduled) GE.__kijuScheduled = new Map();
  GE.__kijuScheduled.set(name, fn);
}

/** Lo llama el planificador: cada tarea aislada (un fallo no para las demás). */
export async function runScheduled(tenantId: string): Promise<void> {
  for (const [name, fn] of GE.__kijuScheduled ?? []) {
    try {
      await fn(tenantId);
    } catch (e) {
      console.error(`[núcleo] tarea ${name}:`, e instanceof Error ? e.message : e);
    }
  }
}

// --- Retención de datos (D5, 19 nov 2026) ------------------------------------------------------------------------
// La limpieza semanal (Operaciones, lib/operaciones/retention.ts) decide la fecha de corte; cada módulo borra lo suyo
// anterior a esa fecha sin que Operaciones conozca sus tablas (Agentes: mensajes de conversaciones).

type RetentionFn = (tenantId: string, cutoff: Date) => Promise<number>;
const GR = globalThis as unknown as { __kijuRetention?: Map<string, RetentionFn> };

/** Un módulo registra cómo borrar sus registros anteriores a la fecha de corte; devuelve cuántas filas borró. */
export function registerRetention(name: string, fn: RetentionFn): void {
  if (!GR.__kijuRetention) GR.__kijuRetention = new Map();
  GR.__kijuRetention.set(name, fn);
}

/** Lo llama la limpieza semanal: cada módulo aislado (un fallo no para los demás). Devuelve las filas por módulo. */
export async function runRetention(tenantId: string, cutoff: Date): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [name, fn] of GR.__kijuRetention ?? []) {
    try {
      out[name] = await fn(tenantId, cutoff);
    } catch (e) {
      console.error(`[núcleo] retención ${name}:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

// --- Clientes del núcleo: lo que cada módulo aporta (14 nov 2026) -------------------------------------------------
// Un módulo puede impedir que se borre un cliente (p. ej. Operaciones si tiene encargos): devuelve el motivo o null.
export type ClientDeleteGuard = (tenantId: string, clientId: string) => Promise<string | null>;
const GC = globalThis as unknown as { __kijuClientGuards?: Map<string, ClientDeleteGuard> };

export function registerClientDeleteGuard(module: string, fn: ClientDeleteGuard): void {
  (GC.__kijuClientGuards ??= new Map()).set(module, fn);
}

// Un módulo con una integración conectada (p. ej. Agentes con Google) ofrece las propiedades que ve (webs de Search
// Console, propiedades de Analytics, fichas de Business Profile) para asignarlas a las fichas de cliente (15 nov 2026).
// El núcleo no sabe de Google: solo pregunta a quien se haya registrado.
export type DirectoryAsset = { kind: string; value: string; label: string; domain: string | null; detail?: string };
export type AssetDirectory = {
  provider: string;
  kinds: string[];
  isConnected: (tenantId: string) => Promise<boolean>;
  /** Lo que ve la integración, por tipo; un tipo que falla va en «errors» (y no se toca el acceso de sus cuentas). */
  list: (tenantId: string) => Promise<{ assets: DirectoryAsset[]; okKinds: string[]; errors: string[] }>;
};
const GD = globalThis as unknown as { __kijuAssetDirs?: Map<string, AssetDirectory> };

export function registerAssetDirectory(d: AssetDirectory): void {
  (GD.__kijuAssetDirs ??= new Map()).set(d.provider, d);
}

export function assetDirectories(): AssetDirectory[] {
  return [...(GD.__kijuAssetDirs ?? new Map<string, AssetDirectory>()).values()];
}

/** Motivos por los que no se puede borrar un cliente (vacío = se puede). */
export async function clientDeleteBlockers(tenantId: string, clientId: string): Promise<string[]> {
  const out: string[] = [];
  for (const fn of (GC.__kijuClientGuards ?? new Map<string, ClientDeleteGuard>()).values()) {
    const why = await fn(tenantId, clientId);
    if (why) out.push(why);
  }
  return out;
}

// --- Rendimiento del cliente (15 nov 2026) -------------------------------------------------------------------------
// Un módulo con una integración (Agentes con Google) registra una FUENTE DE MÉTRICAS: da filas diarias ya normalizadas
// de una propiedad (Search Console, Analytics, Business Profile). El módulo Rendimiento las guarda sin saber de Google.
export type MetricRow = { date: string; metric: string; dimType?: string; dimValue?: string; value: number };
export type MetricTopRow = { kind: 'query' | 'page'; key: string; clicks: number; impressions: number; ctr: number; position: number };
export type MetricSourceKind = {
  /** Tipo de cuenta en la ficha del cliente (client_assets.kind). */
  assetKind: string;
  /** Clave corta con la que se guarda (perf_daily.source). */
  source: 'gsc' | 'ga4' | 'gbp';
  label: string;
  /** Hasta cuántos días atrás deja pedir la fuente (se para antes si se acaban los datos). */
  historyDays: number;
  /** Días de retraso con que llegan los datos. */
  lagDays: number;
  /** Tamaño de cada tramo de la descarga del histórico. */
  chunkDays: number;
  /** Ofrece las consultas y páginas de cada mes. */
  monthlyTop: boolean;
};
export type MetricSource = {
  provider: string;
  kinds: MetricSourceKind[];
  isConnected: (tenantId: string) => Promise<boolean>;
  /** Identificador estable de la propiedad a partir del valor de la ficha (o null si no vale). */
  normalize: (source: string, value: string) => string | null;
  fetchDaily: (tenantId: string, source: string, property: string, from: string, to: string) => Promise<MetricRow[]>;
  fetchTop?: (tenantId: string, source: string, property: string, from: string, to: string, kind: 'query' | 'page', limit: number) => Promise<MetricTopRow[]>;
  /** Consulta libre a un buscador (Search Console): por fecha, consulta, página o dispositivo, con filtros (15 nov 2026). */
  search?: (tenantId: string, source: string, property: string, q: SearchQuery) => Promise<SearchRow[]>;
  /** Estado de una URL en el buscador (último rastreo, indexación). null si la fuente no lo ofrece. */
  inspectUrl?: (tenantId: string, source: string, property: string, url: string) => Promise<UrlInspection | null>;
};
export type SearchDimension = 'date' | 'query' | 'page' | 'device' | 'country';
export type SearchQuery = {
  from: string;
  to: string;
  dimensions: SearchDimension[];
  filters?: { dimension: 'query' | 'page'; operator: 'equals' | 'contains' | 'includingRegex'; expression: string }[];
  limit?: number;
  /** Desde qué fila (paginación de la descarga completa, cimientos 23 nov 2026). */
  startRow?: number;
  /** web (por defecto) | image | video | news | discover | googleNews. */
  searchType?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews';
  /** final (por defecto) | all (incluye los días aún sin cerrar). */
  dataState?: 'final' | 'all';
};
export type SearchRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type UrlInspection = { lastCrawl: string | null; verdict: string | null; coverage: string | null; indexing: string | null; robots: string | null; canonical: string | null };
const GM = globalThis as unknown as { __kijuMetricSources?: Map<string, MetricSource>; __kijuReportSections?: Map<string, ReportSection>; __kijuHealthChecks?: Map<string, ModuleHealthCheck> };

export function registerMetricSource(s: MetricSource): void {
  (GM.__kijuMetricSources ??= new Map()).set(s.provider, s);
}
export function metricSources(): MetricSource[] {
  return [...(GM.__kijuMetricSources ?? new Map<string, MetricSource>()).values()];
}

// Un módulo añade un apartado al informe semanal de Operaciones (p. ej. Rendimiento: cómo van los clientes en Google).
// Devuelve líneas en HTML de Telegram (ya escapado) o null si no hay nada que contar.
export type ReportSection = { title: string; order: number; weekly: (tenantId: string, from: string, to: string) => Promise<string[] | null> };
export function registerReportSection(key: string, s: ReportSection): void {
  (GM.__kijuReportSections ??= new Map()).set(key, s);
}
/** Apartados de los módulos para el informe semanal (cada uno aislado: un fallo no rompe el informe). */
export async function weeklyReportSections(tenantId: string, from: string, to: string): Promise<{ title: string; lines: string[] }[]> {
  const out: { title: string; order: number; lines: string[] }[] = [];
  for (const [key, s] of GM.__kijuReportSections ?? new Map<string, ReportSection>()) {
    try {
      const lines = await s.weekly(tenantId, from, to);
      if (lines?.length) out.push({ title: s.title, order: s.order, lines });
    } catch (e) {
      console.error(`[núcleo] informe semanal ${key}:`, e instanceof Error ? e.message : e);
    }
  }
  return out.sort((a, b) => a.order - b.order).map(({ title, lines }) => ({ title, lines }));
}

// Un módulo añade comprobaciones a Salud del sistema (p. ej. Rendimiento: propiedades que no se pueden descargar).
export type ModuleCheck = { key: string; label: string; status: 'ok' | 'aviso' | 'critico'; detail: string; recommendation: string };
export type ModuleHealthCheck = (tenantId: string) => Promise<ModuleCheck[]>;
export function registerHealthCheck(key: string, fn: ModuleHealthCheck): void {
  (GM.__kijuHealthChecks ??= new Map()).set(key, fn);
}
export async function moduleHealthChecks(tenantId: string): Promise<ModuleCheck[]> {
  const out: ModuleCheck[] = [];
  for (const [key, fn] of GM.__kijuHealthChecks ?? new Map<string, ModuleHealthCheck>()) {
    try {
      out.push(...(await fn(tenantId)));
    } catch (e) {
      console.error(`[núcleo] salud ${key}:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

// --- Cambios propuestos por los agentes (15 nov 2026) ---------------------------------------------------------------
// El motor de propuestas (✅ Hacerlo / ✖️ Descartar, autonomía por herramienta) es de Operaciones. Otro módulo que tenga
// una herramienta de cambio (p. ej. Rendimiento: anotar un hito) registra aquí cómo se ejecuta y la propone con
// proposeChange; Operaciones registra el motor. Sin motor registrado, el cambio se hace directamente.
export type ChangeExecutor = (tenantId: string, data: Record<string, unknown>, by: string) => Promise<ToolResult>;
type ChangeProposer = (ctx: ToolContext, tool: string, summaryHtml: string, data: Record<string, unknown>) => Promise<ToolResult>;
const GP = globalThis as unknown as { __kijuChangeExecutors?: Map<string, ChangeExecutor>; __kijuChangeProposer?: ChangeProposer | null };

export function registerChangeExecutor(tool: string, fn: ChangeExecutor): void {
  (GP.__kijuChangeExecutors ??= new Map()).set(tool, fn);
}
export function changeExecutor(tool: string): ChangeExecutor | null {
  return GP.__kijuChangeExecutors?.get(tool) ?? null;
}
export function setChangeProposer(fn: ChangeProposer): void {
  GP.__kijuChangeProposer = fn;
}
export async function proposeChange(ctx: ToolContext, tool: string, summaryHtml: string, data: Record<string, unknown>): Promise<ToolResult> {
  if (GP.__kijuChangeProposer) return GP.__kijuChangeProposer(ctx, tool, summaryHtml, data);
  const exec = changeExecutor(tool);
  return exec ? exec(ctx.tenantId, data, `Agente (${ctx.agentKey})`) : { ok: false, content: 'Esa acción no está disponible.' };
}

// --- Estrategia (15 nov 2026): cifras, trabajo hecho y calendario, sin que un módulo importe a otro ------------------
// Rendimiento ofrece sus cifras (KPI) ya calculadas; Operaciones, los encargos terminados, las horas y una pregunta al
// equipo sobre un encargo; Estrategia, el calendario de eventos (actualizaciones de Google, festivos) que Rendimiento
// pinta en sus gráficas y usa en sus avisos.
export type KpiInfo = { key: string; label: string; short: string; source: string; format: 'int' | 'pct' | 'dec'; lowerBetter: boolean; summable: boolean };
export type KpiProvider = {
  list: () => KpiInfo[];
  /** Valor de una cifra en cada tramo (null = sin datos de esa fuente en el tramo). */
  values: (tenantId: string, clientId: string, kpiKey: string, ranges: { from: string; to: string }[]) => Promise<(number | null)[]>;
  /** Último día con datos de la fuente de esa cifra para el cliente (null = sin datos). */
  lastDay: (tenantId: string, clientId: string, kpiKey: string) => Promise<string | null>;
};
const GK = globalThis as unknown as { __kijuKpiProvider?: KpiProvider | null; __kijuWorkSource?: WorkSource | null; __kijuTaskAnswers?: Map<string, TaskAnswerHandler>; __kijuEventSources?: Map<string, EventSource> };
export function registerKpiProvider(p: KpiProvider): void {
  GK.__kijuKpiProvider = p;
}
export function kpiProvider(): KpiProvider | null {
  return GK.__kijuKpiProvider ?? null;
}

export type WorkItem = {
  taskId: string;
  /** Referencia interna para poder preguntar por el encargo. */
  ref: string;
  clientId: string;
  title: string;
  description: string;
  doneNote: string;
  workType: string | null;
  doneAt: string; // ISO
  minutes: number | null;
  assigneeName: string | null;
};
export type ClientWorkload = { hoursMonth: number | null; monthlyHours: number | null; upcoming: number | null; horizonDays: number | null; openTasks: number };
export type WorkSource = {
  /** Encargos de clientes terminados desde una fecha (los más antiguos primero, como mucho «limit»). */
  completedSince: (tenantId: string, since: Date, limit: number) => Promise<{ items: WorkItem[]; cursor: string | null }>;
  /** Encargos de un cliente terminados en un periodo (para la pestaña). */
  clientCompleted: (tenantId: string, clientId: string, sinceDays: number) => Promise<WorkItem[]>;
  workload: (tenantId: string, clientId: string) => Promise<ClientWorkload | null>;
  /** Pregunta a quien hizo el encargo (Telegram, con botones «Escribir» y «No aplica»); la respuesta va al manejador «kind». */
  askAboutTask: (tenantId: string, ref: string, kind: string, html: string) => Promise<boolean>;
  /** Encargos abiertos de un cliente (para no proponer lo que ya está pedido). Fase 2 de Estrategia (16 nov 2026). */
  clientOpen?: (tenantId: string, clientId: string) => Promise<OpenWorkItem[]>;
  /** Lo que suele tardar el equipo por tipo de trabajo (mediana de minutos trabajados y número de encargos). */
  effortByType?: (tenantId: string, sinceDays: number) => Promise<Record<string, { medianMinutes: number; n: number }>>;
  /** Tipos de trabajo de la cuenta (clave y nombre). */
  workTypes?: (tenantId: string) => Promise<{ key: string; label: string }[]>;
  /** Crea un encargo para un cliente (lista, responsable y fecha los elige Operaciones con sus fichas). */
  createTask?: (tenantId: string, input: NewTaskInput) => Promise<{ ok: boolean; ref: string | null; url: string | null; message: string }>;
  /**
   * Estado de varios encargos por su referencia (Hito 1 SEO, 23 nov 2026): el registro de intervenciones del núcleo lo
   * pregunta cada hora para poner la fecha de «hecho» sin que la fuente de trabajo tenga que avisar (sirve igual con
   * ClickUp o con la herramienta propia que lo sustituya). Las referencias que no conoce no aparecen en la respuesta.
   */
  requestStatus?: (tenantId: string, refs: string[]) => Promise<{ ref: string; doneAt: string | null; cancelled: boolean }[]>;
};
export type OpenWorkItem = { ref: string; title: string; workType: string | null; status: string; dueDate: string | null };
export type NewTaskInput = { clientId: string; title: string; description: string; workType: string | null; requestedBy: string; /** Proyecto del que nace (cimientos, 23 nov 2026). */ projectId?: string | null };
export function registerWorkSource(w: WorkSource): void {
  GK.__kijuWorkSource = w;
}
export function workSource(): WorkSource | null {
  return GK.__kijuWorkSource ?? null;
}

/** Quien preguntó recibe la respuesta (texto, o null si «No aplica») y devuelve la frase con la que contesta el bot. */
export type TaskAnswerHandler = (tenantId: string, taskId: string, answer: string | null, by: string) => Promise<string>;
export function registerTaskAnswerHandler(kind: string, fn: TaskAnswerHandler): void {
  if (!/^[a-z]{2,10}$/.test(kind)) throw new Error(`Tipo de pregunta no válido: ${kind}`);
  (GK.__kijuTaskAnswers ??= new Map()).set(kind, fn);
}
export function taskAnswerHandler(kind: string): TaskAnswerHandler | null {
  return GK.__kijuTaskAnswers?.get(kind) ?? null;
}

export type ExternalEvent = { date: string; endDate: string | null; kind: string; title: string };
export type EventSource = (tenantId: string, from: string, to: string) => Promise<ExternalEvent[]>;
export function registerEventSource(key: string, fn: EventSource): void {
  (GK.__kijuEventSources ??= new Map()).set(key, fn);
}
/** Eventos externos que se solapan con un periodo (un fallo de una fuente no rompe a quien pregunta). */
export async function externalEvents(tenantId: string, from: string, to: string): Promise<ExternalEvent[]> {
  const out: ExternalEvent[] = [];
  for (const [key, fn] of GK.__kijuEventSources ?? new Map<string, EventSource>()) {
    try {
      out.push(...(await fn(tenantId, from, to)));
    } catch (e) {
      console.error(`[núcleo] eventos ${key}:`, e instanceof Error ? e.message : e);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// --- Botones y respuestas escritas de otros módulos por Telegram (16 nov 2026) ----------------------------------------
// El bot es de Operaciones. Otro módulo (Estrategia: propuestas del estratega) manda mensajes con botones cuyo dato
// empieza por «x:<módulo>:» y registra aquí quién los atiende; si necesita un texto («¿qué ajustas?»), lo pide con
// awaitText y Operaciones le entrega el siguiente mensaje de ese chat.
export type ModuleCallbackInput = { tenantId: string; data: string; chatId: string; by: string; isOwner: boolean };
export type ModuleCallbackResult = {
  /** Texto corto del aviso del botón. */
  answer?: string;
  alert?: boolean;
  /** Botones nuevos para el mensaje (null = quitarlos; sin definir = dejarlos). */
  keyboard?: OutboundButton[][] | null;
  /** Mensaje aparte en el chat (HTML ya escapado). */
  reply?: string;
  /** El módulo espera un texto: Operaciones pregunta esto y le pasa la respuesta. */
  awaitText?: string;
};
export type ModuleTextInput = { tenantId: string; chatId: string; text: string; by: string; isOwner: boolean };
type ModuleHandlers = { callback: (i: ModuleCallbackInput) => Promise<ModuleCallbackResult>; text?: (i: ModuleTextInput) => Promise<string> };
const GX = globalThis as unknown as { __kijuModuleButtons?: Map<string, ModuleHandlers> };

/** Prefijo corto del módulo (2-4 letras): sus botones llevan el dato «x:<prefijo>:…» (máx. 64 bytes en Telegram). */
export function registerModuleButtons(prefix: string, handlers: ModuleHandlers): void {
  if (!/^[a-z]{2,4}$/.test(prefix)) throw new Error(`Prefijo de botones no válido: ${prefix}`);
  (GX.__kijuModuleButtons ??= new Map()).set(prefix, handlers);
}
export function moduleButtons(prefix: string): ModuleHandlers | null {
  return GX.__kijuModuleButtons?.get(prefix) ?? null;
}
export const MODULE_BUTTON_RE = /^x:([a-z]{2,4}):([A-Za-z0-9:_-]{1,58})$/;

// --- Trabajos para subagentes desde el núcleo (17 nov 2026) -----------------------------------------------------------
// El registro de errores (núcleo) encarga diagnósticos al Técnico de mantenimiento sin importar el módulo Agentes: Agentes
// registra aquí cómo crear un trabajo (cola agt_jobs; el resultado llega al dueño por Telegram).
export type AgentJobRequest = { tenantId: string; agentKey: string; title: string; instruction: string; requestedBy: string; data?: Record<string, unknown> };
export type AgentJobCreator = (r: AgentJobRequest) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
const GJ = globalThis as unknown as { __kijuAgentJobCreator?: AgentJobCreator };
export function setAgentJobCreator(fn: AgentJobCreator): void {
  GJ.__kijuAgentJobCreator = fn;
}
export function agentJobCreator(): AgentJobCreator | null {
  return GJ.__kijuAgentJobCreator ?? null;
}

// --- Comunicaciones con clientes (cimientos, 23 nov 2026) -------------------------------------------------------------
// El núcleo decide QUÉ sale, A QUIÉN y si pasa por aprobación (lib/core/comms.ts); un módulo con buzón lo ENVÍA
// (Operaciones registra Resend) y avisa al dueño de lo que espera su aprobación (Telegram). Las respuestas del cliente
// entran por el buzón de Operaciones, que llama a receiveClientReply (lib/core/comms.ts) para unirlas a su hilo.
export type MailSender = {
  send: (
    tenantId: string,
    m: { to: { email: string; name: string }[]; cc: { email: string; name: string }[]; subject: string; text: string; messageId: string; idempotencyKey: string }
  ) => Promise<{ providerId: string }>;
  /** Dominio del buzón, para el Message-ID de los mensajes (hilos). */
  domain: (tenantId: string) => Promise<string>;
};
export type CommsApprovalNotice = { tenantId: string; messageId: string; clientName: string; kind: string; subject: string; body: string; author: string };
export type ClientReply = { tenantId: string; inboundId: string; clientId: string | null; threadKeys: string[]; subject: string; text: string; from: string };
const GM2 = globalThis as unknown as {
  __kijuMailSender?: MailSender;
  __kijuCommsNotifier?: CommsApprovalNotifier;
  __kijuReplyListeners?: Map<string, (r: ClientReply & { messageId: string; projectId: string | null; kind: string }) => Promise<void>>;
};
export function registerMailSender(s: MailSender): void {
  GM2.__kijuMailSender = s;
}
export function mailSender(): MailSender | null {
  return GM2.__kijuMailSender ?? null;
}
/** Quién avisa al dueño de un mensaje pendiente de aprobar (Operaciones, por Telegram) y cierra el aviso al decidirlo. */
export type CommsApprovalNotifier = {
  notify: (n: CommsApprovalNotice) => Promise<void>;
  /** Decidido fuera del aviso (p. ej. en Para ti): el aviso pierde sus botones y dice qué se hizo. */
  decided: (tenantId: string, messageId: string, line: string) => Promise<void>;
};
export function registerCommsApprovalNotifier(n: CommsApprovalNotifier): void {
  GM2.__kijuCommsNotifier = n;
}
export function commsApprovalNotifier(): CommsApprovalNotifier | null {
  return GM2.__kijuCommsNotifier ?? null;
}
/** Un módulo quiere enterarse de las respuestas a sus mensajes (p. ej. SEO, para completar el expediente). */
export function registerClientReplyListener(key: string, fn: (r: ClientReply & { messageId: string; projectId: string | null; kind: string }) => Promise<void>): void {
  (GM2.__kijuReplyListeners ??= new Map()).set(key, fn);
}
export function clientReplyListeners(): ((r: ClientReply & { messageId: string; projectId: string | null; kind: string }) => Promise<void>)[] {
  return [...(GM2.__kijuReplyListeners?.values() ?? [])];
}

// --- Lo que sabe un departamento de los proyectos de un cliente (Hito 2 SEO, 24 nov 2026) ----------------------------
// El estratega (Estrategia) monta su expediente con lo que cada departamento sabe de los proyectos del cliente, sin leer
// sus tablas: SEO registra aquí un proveedor que resume hallazgos, plan de mejora, temas y competencia de cada proyecto.
// Las URLs y búsquedas que devuelve son citables como evidencia en las propuestas del estratega.
export type ProjectDossierSection = { projectId: string; projectName: string; title: string; lines: string[]; urls?: string[]; queries?: string[] };
export type ProjectDossierProvider = (tenantId: string, clientId: string) => Promise<ProjectDossierSection[]>;
const GPD = globalThis as unknown as { __kijuProjectDossiers?: Map<string, ProjectDossierProvider> };
export function registerProjectDossierProvider(key: string, fn: ProjectDossierProvider): void {
  (GPD.__kijuProjectDossiers ??= new Map()).set(key, fn);
}
/** Todas las secciones de todos los proveedores (un fallo de uno no rompe a quien pregunta). */
export async function projectDossierSections(tenantId: string, clientId: string): Promise<ProjectDossierSection[]> {
  const out: ProjectDossierSection[] = [];
  for (const [key, fn] of GPD.__kijuProjectDossiers ?? new Map<string, ProjectDossierProvider>()) {
    try {
      out.push(...(await fn(tenantId, clientId)));
    } catch (e) {
      console.error(`[núcleo] expediente de proyecto ${key}:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

// --- Resultados de Google por una búsqueda (Hito 2 SEO, 24 nov 2026) --------------------------------------------------
// Para la competencia: quién sale en orgánico y en el paquete local por una búsqueda. Lo registra quien tenga un
// proveedor (Agentes, con DataForSEO); SEO lo usa sin saber de DataForSEO.
export type SerpResult = {
  organic: { rank: number; domain: string; url: string; title: string }[];
  localPack: { rank: number; title: string; domain: string | null; rating: number | null; reviews: number | null }[];
  costUsd: number | null;
};
export type SerpSource = {
  isConnected: (tenantId: string) => Promise<boolean>;
  search: (tenantId: string, q: { keyword: string; location: string; language: string; depth?: number }) => Promise<SerpResult>;
};
const GSERP = globalThis as unknown as { __kijuSerpSource?: SerpSource | null };
export function registerSerpSource(s: SerpSource): void {
  GSERP.__kijuSerpSource = s;
}
export function serpSource(): SerpSource | null {
  return GSERP.__kijuSerpSource ?? null;
}
