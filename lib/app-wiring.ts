import 'server-only';

// Conexión de los módulos con el núcleo al arrancar (capa de aplicación: NO es un módulo, por eso puede importar varios).
// Operaciones publica sus herramientas y su salida por Telegram y correo; Agentes atiende los mensajes libres, publica las
// suyas (trabajos e integraciones) y programa sus tareas. Se llama desde instrumentation.ts, la ruta del webhook de
// Telegram y las pantallas de Agentes; es idempotente.
import { registerOperacionesCapabilities } from '@/lib/operaciones/agent-capabilities';
import { registerAgentesCapabilities } from '@/lib/agentes/register';

let wired = false;
export function wireApp(): void {
  if (wired) return;
  wired = true;
  registerOperacionesCapabilities();
  registerAgentesCapabilities();
}
