import 'server-only';

// Conexión de los módulos con el núcleo al arrancar (capa de aplicación: NO es un módulo, por eso puede importar varios).
// Operaciones publica sus herramientas y su salida por Telegram y correo; Agentes atiende los mensajes libres, publica las
// suyas (trabajos e integraciones) y programa sus tareas. Se llama desde instrumentation.ts, la ruta del webhook de
// Telegram y las pantallas de Agentes; es idempotente.
import { registerOperacionesCapabilities } from '@/lib/operaciones/agent-capabilities';
import { registerAgentesCapabilities } from '@/lib/agentes/register';
import { registerRendimientoCapabilities } from '@/lib/rendimiento/register';
import { registerEstrategiaCapabilities } from '@/lib/estrategia/register';
import { registerErrorCapabilities } from '@/lib/core/errors';
import { registerKnowledgeCapabilities } from '@/lib/core/knowledge';
import { registerOperacionesPromptEvals } from '@/lib/operaciones/prompt-evals';
import { registerPlatformCapabilities } from '@/lib/core/platform';
import { registerSeoCapabilities } from '@/lib/seo/register';

let wired = false;
export function wireApp(): void {
  if (wired) return;
  wired = true;
  registerPlatformCapabilities(); // cimientos (23 nov 2026): cola de trabajos, mensajes a clientes, Search Console, rastreador
  registerSeoCapabilities(); // Hito 1 SEO (23 nov 2026): hallazgos de Salud técnica y la auditoría en la cola
  registerOperacionesCapabilities();
  registerAgentesCapabilities();
  registerRendimientoCapabilities();
  registerEstrategiaCapabilities();
  registerErrorCapabilities(); // registro de errores del núcleo: herramientas del Técnico de mantenimiento, botones y limpieza
  registerKnowledgeCapabilities(); // base de conocimiento del núcleo: herramientas, botones de revisión y embeddings
  registerOperacionesPromptEvals(); // examen del prompt «Convertir nota en encargos» (IA → Prompts)
}
