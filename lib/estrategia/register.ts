import 'server-only';

// Registro del módulo Estrategia en el núcleo (lo llama lib/app-wiring.ts al arrancar):
//   - tarea del planificador «estrategia de clientes» (procesos por plan y frecuencia, extracción de encargos);
//   - respuesta a la pregunta «¿en qué URL…?» que Operaciones hace por Telegram (tipo «url»);
//   - calendario de eventos para las gráficas y los avisos de Rendimiento;
//   - herramienta del agente estrategia_cliente (lectura), comprobación de Salud y apartado del informe semanal;
//   - botones «x:est:…» de las propuestas del estratega por Telegram y el texto de «Ajustar» u «Otro motivo».
import {
  registerEventSource,
  registerClientDeleteGuard,
  registerHealthCheck,
  registerModuleButtons,
  registerReportSection,
  registerScheduled,
  registerTaskAnswerHandler,
  registerTools,
  type AgentTool,
  type ModuleCheck
} from '@/lib/core/capabilities';
import { findCoreClient } from '@/lib/core/clients';
import { eventsOverlapping, historyBlocker, listRuns } from '@/lib/estrategia/store';
import { runEstrategia } from '@/lib/estrategia/scheduler';
import { answerUrlQuestion } from '@/lib/estrategia/processes';
import { handleStrategistButton, handleStrategistText } from '@/lib/estrategia/strategist';
import { strategyText, weeklyLines } from '@/lib/estrategia/report';
import { PROCESS, isProcessKey } from '@/lib/estrategia/rules';

const estrategiaCliente: AgentTool = {
  name: 'estrategia_cliente',
  module: 'estrategia',
  title: 'Estrategia y seguimiento de un cliente',
  description:
    'Cómo va la estrategia de un cliente según su plan de seguimiento: objetivos con su estado (en camino, en riesgo, desviado…), señales abiertas (oportunidades como consultas al alcance o CTR bajo, páginas en caída, problemas técnicos o de la web), salud de la web, palabras clave seguidas, trabajo reciente con las URLs tocadas y las propuestas del estratega pendientes de decidir. No gasta llamadas a Google. Úsala para «¿cómo va la estrategia de X?», «¿qué oportunidades tiene X?», «¿qué propone el estratega para X?» o «¿va bien la web de X?».',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { cliente: { type: 'string', description: 'Nombre del cliente' } }, required: ['cliente'], additionalProperties: false },
  async run(ctx, input) {
    const name = typeof input.cliente === 'string' ? input.cliente.trim().slice(0, 120) : '';
    const { client, options } = await findCoreClient(ctx.tenantId, name);
    if (!client) return { ok: false, content: options.length ? `Hay varios clientes posibles: ${options.join(' | ')}. Pregunta cuál.` : `No encuentro el cliente «${name}».` };
    const text = await strategyText(ctx.tenantId, client.id);
    return text ? { ok: true, content: text } : { ok: false, content: 'No encuentro ese cliente.' };
  }
};

export const ESTRATEGIA_TOOLS: AgentTool[] = [estrategiaCliente];

/** Salud del sistema: procesos que fallan 3 veces seguidas. */
export async function strategyHealth(tenantId: string): Promise<ModuleCheck[]> {
  const runs = await listRuns(tenantId);
  if (!runs.length) return [];
  const bad = runs.filter((r) => r.errorCount >= 3);
  return [
    {
      key: 'estrategia',
      label: 'Estrategia de clientes (procesos de seguimiento)',
      status: bad.length ? 'aviso' : 'ok',
      detail: bad.length ? `${bad.length} proceso(s) fallan: ${[...new Set(bad.map((r) => `${isProcessKey(r.process) ? PROCESS[r.process].label : r.process}: ${(r.lastError ?? '').slice(0, 80)}`))].slice(0, 5).join(' | ')}` : `${runs.length} procesos programados sin errores repetidos.`,
      recommendation: bad.length ? 'Abre el panel Estrategia para ver qué cliente es. Si es de Google, revisa que la propiedad de Search Console esté asignada y con acceso; si es PageSpeed, añade PAGESPEED_API_KEY al .env.' : ''
    }
  ];
}

let done = false;
const inBackground = new Set<string>();
export function registerEstrategiaCapabilities(): void {
  if (done) return;
  done = true;
  registerTools(ESTRATEGIA_TOOLS);
  registerTaskAnswerHandler('url', (tenantId, taskId, answer) => answerUrlQuestion(tenantId, taskId, answer));
  registerEventSource('estrategia', async (tenantId, from, to) => (await eventsOverlapping(tenantId, from, to)).map((e) => ({ date: e.date, endDate: e.endDate, kind: e.kind, title: e.title })));
  registerScheduled('estrategia de clientes', async (tenantId) => {
    // En segundo plano (no se espera): las peticiones a webs y a Google no retrasan al resto del planificador.
    if (inBackground.has(tenantId)) return;
    inBackground.add(tenantId);
    void runEstrategia(tenantId, { budgetMs: 25_000 })
      .catch((e) => console.error('[estrategia] planificador:', e instanceof Error ? e.message : e))
      .finally(() => inBackground.delete(tenantId));
  });
  registerReportSection('estrategia', { title: '🧭 Estrategia de los clientes', order: 25, weekly: (t) => weeklyLines(t) });
  registerHealthCheck('estrategia', strategyHealth);
  // D6: con histórico, el cliente se da de baja antes de borrarlo y el borrado pide escribir su nombre.
  registerClientDeleteGuard('estrategia', historyBlocker);
  registerModuleButtons('est', { callback: handleStrategistButton, text: handleStrategistText });
}
