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
  /** La acción quedó propuesta para aprobación (botones enviados aparte). */
  proposed?: boolean;
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
