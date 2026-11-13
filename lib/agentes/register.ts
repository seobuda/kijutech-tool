import 'server-only';

// Registro del módulo Agentes en el núcleo (lo llama lib/app-wiring.ts al arrancar):
//   - atiende los mensajes libres de Telegram y correo del dueño (agente principal);
//   - publica sus herramientas: trabajos de subagentes e integraciones (DataForSEO, Clarity, Google);
//   - programa los trabajos de los subagentes en el planificador.
import { registerScheduled, registerTools, setInboundHandler, type AgentTool } from '@/lib/core/capabilities';
import { handleInbound } from '@/lib/agentes/inbound';
import { encargarAgente, estadoTrabajos, runAgentJobs } from '@/lib/agentes/jobs';
import {
  clarityInsights,
  dataForSeoSerp,
  dataForSeoVolume,
  ga4Properties,
  ga4Report,
  gbpLocations,
  gscPerformance,
  gscSites,
  isConnected
} from '@/lib/agentes/integrations';

const s = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const n = (v: unknown, def: number, min: number, max: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : def;
};
const guard = async (fn: () => Promise<string>) => {
  try {
    return { ok: true, content: await fn() };
  } catch (e) {
    return { ok: false, content: e instanceof Error ? e.message : 'La integración falló.' };
  }
};

export const INTEGRATION_TOOLS: AgentTool[] = [
  {
    name: 'seo_serp_google',
    module: 'agentes',
    title: 'DataForSEO: resultados de Google',
    description: 'Los primeros resultados orgánicos de Google para una búsqueda (por defecto España, español). Sirve para ver quién posiciona y en qué puesto está un cliente.',
    risk: 'lectura',
    inputSchema: { type: 'object', properties: { keyword: { type: 'string' }, ubicacion: { type: 'string', description: 'Por defecto Spain' }, idioma: { type: 'string', description: 'Código, por defecto es' }, profundidad: { type: 'number', description: '10 a 100' } }, required: ['keyword'], additionalProperties: false },
    available: (t) => isConnected(t, 'dataforseo'),
    run: (ctx, i) => guard(() => dataForSeoSerp(ctx.tenantId, s(i.keyword, 200), s(i.ubicacion, 80) || 'Spain', s(i.idioma, 5) || 'es', n(i.profundidad, 10, 10, 100)))
  },
  {
    name: 'seo_volumen_keywords',
    module: 'agentes',
    title: 'DataForSEO: volumen de búsquedas',
    description: 'Volumen mensual, competencia y CPC de una lista de palabras clave (hasta 100).',
    risk: 'lectura',
    inputSchema: { type: 'object', properties: { keywords: { type: 'array', items: { type: 'string' } }, ubicacion: { type: 'string' }, idioma: { type: 'string' } }, required: ['keywords'], additionalProperties: false },
    available: (t) => isConnected(t, 'dataforseo'),
    run: (ctx, i) => guard(() => dataForSeoVolume(ctx.tenantId, (Array.isArray(i.keywords) ? i.keywords : []).map((k) => s(k, 120)).filter(Boolean), s(i.ubicacion, 80) || 'Spain', s(i.idioma, 5) || 'es'))
  },
  {
    name: 'clarity_resumen',
    module: 'agentes',
    title: 'Clarity: comportamiento en la web',
    description: 'Métricas de Microsoft Clarity de los últimos 1 a 3 días (sesiones, scroll, clics muertos, rage clicks…), opcionalmente por URL, Device, Country, Browser o OS. Límite de Clarity: 10 consultas al día.',
    risk: 'lectura',
    inputSchema: { type: 'object', properties: { dias: { type: 'number', description: '1 a 3' }, dimension: { type: 'string', enum: ['URL', 'Device', 'Country', 'Browser', 'OS', 'Source', 'Medium', 'Campaign'] } }, additionalProperties: false },
    available: (t) => isConnected(t, 'clarity'),
    run: (ctx, i) => guard(() => clarityInsights(ctx.tenantId, n(i.dias, 1, 1, 3), s(i.dimension, 20) || null))
  },
  {
    name: 'gsc_propiedades',
    module: 'agentes',
    title: 'Search Console: propiedades',
    description: 'Propiedades (webs) disponibles en Google Search Console, con su URL exacta para las consultas.',
    risk: 'lectura',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    available: (t) => isConnected(t, 'google'),
    run: (ctx) => guard(() => gscSites(ctx.tenantId))
  },
  {
    name: 'gsc_rendimiento',
    module: 'agentes',
    title: 'Search Console: rendimiento',
    description: 'Clics, impresiones, CTR y posición en Google de una web, por consulta, página, país, dispositivo o fecha. «sitio» debe ser exactamente como sale en gsc_propiedades (p. ej. sc-domain:cliente.com o https://cliente.com/).',
    risk: 'lectura',
    inputSchema: {
      type: 'object',
      properties: { sitio: { type: 'string' }, dias: { type: 'number', description: '7 a 480, por defecto 28' }, dimension: { type: 'string', enum: ['query', 'page', 'country', 'device', 'date'] }, pagina_contiene: { type: 'string' }, limite: { type: 'number' } },
      required: ['sitio'],
      additionalProperties: false
    },
    available: (t) => isConnected(t, 'google'),
    run: (ctx, i) => guard(() => gscPerformance(ctx.tenantId, s(i.sitio, 200), n(i.dias, 28, 7, 480), s(i.dimension, 10) || 'query', s(i.pagina_contiene, 200) || null, n(i.limite, 25, 5, 100)))
  },
  {
    name: 'ga4_propiedades',
    module: 'agentes',
    title: 'Analytics: propiedades',
    description: 'Propiedades de Google Analytics 4 a las que hay acceso, con su número.',
    risk: 'lectura',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    available: (t) => isConnected(t, 'google'),
    run: (ctx) => guard(() => ga4Properties(ctx.tenantId))
  },
  {
    name: 'ga4_informe',
    module: 'agentes',
    title: 'Analytics: informe',
    description: 'Informe de Google Analytics 4: métricas (sessions, totalUsers, newUsers, conversions, engagementRate, screenPageViews…) de los últimos N días, opcionalmente por una dimensión (sessionDefaultChannelGroup, pagePath, deviceCategory, country, date…).',
    risk: 'lectura',
    inputSchema: {
      type: 'object',
      properties: { propiedad: { type: 'string', description: 'Número de la propiedad' }, dias: { type: 'number' }, metricas: { type: 'array', items: { type: 'string' } }, dimension: { type: 'string' } },
      required: ['propiedad'],
      additionalProperties: false
    },
    available: (t) => isConnected(t, 'google'),
    run: (ctx, i) =>
      guard(() =>
        ga4Report(
          ctx.tenantId,
          s(i.propiedad, 40),
          n(i.dias, 28, 1, 365),
          (Array.isArray(i.metricas) && i.metricas.length ? i.metricas : ['sessions', 'totalUsers', 'conversions']).map((m) => s(m, 60)).filter(Boolean),
          s(i.dimension, 60) || 'sessionDefaultChannelGroup'
        )
      )
  },
  {
    name: 'gbp_fichas',
    module: 'agentes',
    title: 'Business Profile: fichas',
    description: 'Fichas de Google Business Profile (Google Maps) a las que hay acceso. Requiere que Google haya aprobado el acceso a su API.',
    risk: 'lectura',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    available: (t) => isConnected(t, 'google'),
    run: (ctx) => guard(() => gbpLocations(ctx.tenantId))
  }
];

export const AGENTES_TOOLS: AgentTool[] = [encargarAgente, estadoTrabajos, ...INTEGRATION_TOOLS];

let done = false;
export function registerAgentesCapabilities(): void {
  if (done) return;
  done = true;
  registerTools(AGENTES_TOOLS);
  setInboundHandler('agentes', handleInbound);
  registerScheduled('trabajos de subagentes', runAgentJobs);
}
