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
};

export type OutboundButton = { text: string; data: string };
export type TelegramOutbound = {
  sendText: (tenantId: string, chatId: string, html: string, buttons?: OutboundButton[][]) => Promise<void>;
  sendVoice: (tenantId: string, chatId: string, ogg: Uint8Array, caption?: string) => Promise<boolean>;
  sendTyping: (tenantId: string, chatId: string, action: 'typing' | 'record_voice') => Promise<void>;
  /** Aviso fiable al dueño por la cola de avisos (para resultados que llegan más tarde, como un trabajo de subagente). */
  notifyOwner: (tenantId: string, key: string, html: string, buttons?: OutboundButton[][]) => Promise<void>;
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
};
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
