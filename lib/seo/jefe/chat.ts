// SEO · Jefe SEO, D3: datos del hilo de conversación con el Jefe desde Plan de servicio. PURO.
/** Clave del agente en el módulo Agentes (se crea solo: lib/agentes/store.ts, DEFAULT_AGENTS). */
export const JEFE_AGENT_KEY = 'jefe_seo';
/** Opus 5.5 piensa y el pensamiento cuenta dentro de max_tokens (no se puede apagar): margen para respuestas con datos. */
export const JEFE_CHAT_MAX_TOKENS = 16_000;
/** Un hilo compartido por proyecto: es la memoria de la conversación sobre su plan. */
export const jefeThread = (projectId: string) => `seo:${projectId}`;
