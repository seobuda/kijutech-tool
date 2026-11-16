import 'server-only';

// Registro del módulo Rendimiento en el núcleo (lo llama lib/app-wiring.ts al arrancar):
//   - tarea del planificador: descarga (sync.ts), avisos de caídas y subidas, y resumen del mes;
//   - herramientas del agente: rendimiento_cliente (lectura, sin coste) y anotar_hito (cambio, con ✅ / ✖️);
//   - apartado del informe semanal de Operaciones y comprobación para Salud del sistema.
import {
  proposeChange,
  registerChangeExecutor,
  registerHealthCheck,
  registerKpiProvider,
  registerReportSection,
  registerScheduled,
  registerTools,
  type AgentTool,
  type KpiProvider,
  type ModuleCheck,
  type ToolResult
} from '@/lib/core/capabilities';
import { findCoreClient } from '@/lib/core/clients';
import { ANNOTATION_KINDS, ANNOTATION_KIND_LABEL, KPI, KPIS, daysBetween, fmtDayYear, isAnnotationKind, isYmd, kpiValue, madridNow, type AnnotationKind, type CompareKey, type PeriodKey } from '@/lib/rendimiento/rules';
import { activeBySource, listSync, loadDays, PerfError, saveAnnotation } from '@/lib/rendimiento/store';
import { runPerformanceSync } from '@/lib/rendimiento/sync';
import { clientPerformance, monthlyClientText, performanceText, previousMonth, runMonthlySummary, runPerformanceAlerts, weeklyLines } from '@/lib/rendimiento/report';

const s = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ok = (content: string): ToolResult => ({ ok: true, content });
const fail = (content: string): ToolResult => ({ ok: false, content });
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function client(tenantId: string, name: string) {
  const { client: c, options } = await findCoreClient(tenantId, name);
  if (!c) return { error: options.length ? `Hay varios clientes posibles: ${options.join(' | ')}. Pregunta cuál.` : `No encuentro el cliente «${name}».` };
  return { client: c };
}

const rendimientoCliente: AgentTool = {
  name: 'rendimiento_cliente',
  module: 'rendimiento',
  title: 'Rendimiento de un cliente (histórico guardado)',
  description:
    'Cómo va un cliente en Google con el histórico que guardamos cada día (Search Console, Analytics y su ficha de Business Profile): cifras del periodo con su variación, sesiones por canal, hitos de la estrategia con su antes y después, y consultas que suben y bajan. No gasta llamadas a Google y llega más atrás que Google (que solo guarda 16 meses). Úsala primero para «¿cómo va X?»; las de gsc_/ga4_/gbp_ solo para detalle que no esté aquí (p. ej. una página concreta). Con periodo «mes» devuelve el informe del mes pasado listo para enviar.',
  risk: 'lectura',
  inputSchema: {
    type: 'object',
    properties: {
      cliente: { type: 'string', description: 'Nombre del cliente' },
      periodo: { type: 'string', enum: ['28', '90', '365', 'all', 'mes'], description: 'Días (28, 90, 365), todo el histórico o el informe del mes pasado. Por defecto 28.' },
      comparar: { type: 'string', enum: ['prev', 'yoy', 'contract', 'none'], description: 'Periodo anterior (por defecto), mismo periodo del año pasado, antes del inicio del servicio o nada.' }
    },
    required: ['cliente'],
    additionalProperties: false
  },
  async run(ctx, input) {
    const r = await client(ctx.tenantId, s(input.cliente, 120));
    if ('error' in r) return fail(r.error ?? 'No encuentro el cliente.');
    if (s(input.periodo, 5) === 'mes') {
      const month = previousMonth(madridNow().date);
      const text = await monthlyClientText(ctx.tenantId, r.client.id, month, { isAdmin: ctx.actor.isOwner });
      return ok(text ?? `${r.client.name} aún no tiene datos guardados de ese mes.`);
    }
    const period = (['28', '90', '365', 'all'].includes(s(input.periodo, 5)) ? s(input.periodo, 5) : '28') as PeriodKey;
    const compare = (['prev', 'yoy', 'contract', 'none'].includes(s(input.comparar, 10)) ? s(input.comparar, 10) : 'prev') as CompareKey;
    const p = await clientPerformance(ctx.tenantId, r.client.id, { period, compare, isAdmin: ctx.actor.isOwner });
    return p ? ok(performanceText(p)) : fail('No encuentro ese cliente.');
  }
};

const anotarHito: AgentTool = {
  name: 'anotar_hito',
  module: 'rendimiento',
  title: 'Anotar un hito de la estrategia',
  description:
    'Anota en el rendimiento de un cliente algo que ha pasado y que puede mover sus cifras: web nueva, campaña, artículos publicados, cambio de ficha de Google, actualización de Google… Sale marcado en sus gráficas y sirve para ver el antes y el después. Una frase clara por hito, con su fecha (por defecto hoy).',
  risk: 'cambio',
  inputSchema: {
    type: 'object',
    properties: {
      cliente: { type: 'string' },
      fecha: { type: 'string', description: 'AAAA-MM-DD; por defecto hoy' },
      tipo: { type: 'string', enum: [...ANNOTATION_KINDS] },
      titulo: { type: 'string', description: 'Qué pasó, en una frase' },
      notas: { type: 'string' }
    },
    required: ['cliente', 'titulo'],
    additionalProperties: false
  },
  async run(ctx, input) {
    const r = await client(ctx.tenantId, s(input.cliente, 120));
    if ('error' in r) return fail(r.error ?? 'No encuentro el cliente.');
    const fecha = s(input.fecha, 10) || madridNow().date;
    if (!isYmd(fecha)) return fail('La fecha debe ser AAAA-MM-DD.');
    const titulo = s(input.titulo, 200);
    if (!titulo) return fail('Falta qué pasó (titulo).');
    const tipo: AnnotationKind = isAnnotationKind(s(input.tipo, 20)) ? (s(input.tipo, 20) as AnnotationKind) : 'otro';
    const notas = s(input.notas, 1000);
    return proposeChange(
      ctx,
      'anotar_hito',
      `📌 Hito para <b>${esc(r.client.name)}</b> (${ANNOTATION_KIND_LABEL[tipo]}, ${fmtDayYear(fecha)}):\n<i>${esc(titulo)}</i>${notas ? `\n${esc(notas)}` : ''}`,
      { clientId: r.client.id, clientName: r.client.name, fecha, tipo, titulo, notas }
    );
  }
};

export const RENDIMIENTO_TOOLS: AgentTool[] = [rendimientoCliente, anotarHito];

/** Comprobación para Salud: propiedades que no se pueden descargar o que llevan días sin datos nuevos. */
export async function performanceHealth(tenantId: string): Promise<ModuleCheck[]> {
  const rows = (await listSync(tenantId)).filter((r) => r.status !== 'inactiva');
  if (!rows.length) return [];
  const today = madridNow().date;
  const errors = rows.filter((r) => r.status === 'error' && r.errorCount >= 3);
  const stale = rows.filter((r) => r.status !== 'error' && r.backfillDone && r.syncedUntil && daysBetween(r.syncedUntil, today) > 10);
  const bad = [...errors, ...stale];
  return [
    {
      key: 'rendimiento',
      label: 'Rendimiento de clientes (descarga de Google)',
      status: bad.length ? 'aviso' : 'ok',
      detail: bad.length
        ? `${errors.length ? `${errors.length} propiedad(es) con error: ${[...new Set(errors.map((r) => (r.lastError ?? '').slice(0, 80)))].join(' | ')}` : ''}${errors.length && stale.length ? '. ' : ''}${stale.length ? `${stale.length} propiedad(es) sin datos nuevos desde hace más de 10 días` : ''}`
        : `${rows.length} propiedades al día o descargando.`,
      recommendation: bad.length ? 'Abre el panel Rendimiento para ver qué cliente es. Si Google dice que no hay permiso, revisa el acceso de la cuenta conectada a esa propiedad («Comprobar accesos» en la ficha) o que Google haya aprobado la API de Business Profile.' : ''
    }
  ];
}

/** Cifras de Rendimiento para otros módulos (Estrategia: objetivos, detectores), por el núcleo. */
export const RENDIMIENTO_KPI_PROVIDER: KpiProvider = {
  list: () => KPIS.map((k) => ({ key: k.key, label: k.label, short: k.short, source: k.source, format: k.format, lowerBetter: Boolean(k.lowerBetter), summable: k.format === 'int' })),
  async values(tenantId, clientId, kpiKey, ranges) {
    const k = KPI[kpiKey];
    if (!k || !ranges.length) return ranges.map(() => null);
    const sync = activeBySource(await listSync(tenantId, clientId))[k.source];
    if (!sync) return ranges.map(() => null);
    const from = ranges.map((r) => r.from).sort()[0];
    const to = ranges.map((r) => r.to).sort().pop()!;
    const days = await loadDays(tenantId, clientId, [{ source: k.source, property: sync.property }], from, to);
    return ranges.map((r) => kpiValue(k, days, r.from, r.to));
  },
  async lastDay(tenantId, clientId, kpiKey) {
    const k = KPI[kpiKey];
    if (!k) return null;
    return activeBySource(await listSync(tenantId, clientId))[k.source]?.syncedUntil ?? null;
  }
};

let done = false;
const lastExtras = new Map<string, number>();
const inBackground = new Set<string>();
export function registerRendimientoCapabilities(): void {
  if (done) return;
  done = true;
  registerTools(RENDIMIENTO_TOOLS);
  registerKpiProvider(RENDIMIENTO_KPI_PROVIDER);
  registerChangeExecutor('anotar_hito', async (tenantId, data) => {
    try {
      await saveAnnotation(tenantId, String(data.clientId), { date: String(data.fecha), kind: String(data.tipo), title: String(data.titulo), notes: String(data.notas ?? ''), source: 'agente' });
      return ok(`Hito anotado en el rendimiento de ${String(data.clientName)}.`);
    } catch (e) {
      return fail(e instanceof PerfError ? e.userMessage : 'No se pudo anotar el hito.');
    }
  });
  registerScheduled('rendimiento de clientes', async (tenantId) => {
    // La descarga va en segundo plano (no se espera): una petición lenta a Google no retrasa los avisos, la bandeja de
    // salida ni la jornada, que comparten el planificador. Una sola descarga a la vez por cuenta.
    if (!inBackground.has(tenantId)) {
      inBackground.add(tenantId);
      void runPerformanceSync(tenantId, { budgetMs: 20_000 })
        .catch((e) => console.error('[rendimiento] descarga:', e instanceof Error ? e.message : e))
        .finally(() => inBackground.delete(tenantId));
    }
    // Avisos y resumen mensual: basta con mirarlo cada 10 minutos.
    if (Date.now() - (lastExtras.get(tenantId) ?? 0) < 10 * 60_000) return;
    lastExtras.set(tenantId, Date.now());
    await runPerformanceAlerts(tenantId);
    await runMonthlySummary(tenantId);
  });
  registerReportSection('rendimiento', { title: '📈 Rendimiento de los clientes', order: 20, weekly: (t) => weeklyLines(t) });
  registerHealthCheck('rendimiento', performanceHealth);
}
