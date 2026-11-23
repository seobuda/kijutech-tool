import 'server-only';

// Registro del módulo Agentes en el núcleo (lo llama lib/app-wiring.ts al arrancar):
//   - atiende los mensajes libres de Telegram y correo del dueño (agente principal);
//   - publica sus herramientas: trabajos de subagentes e integraciones (DataForSEO, Clarity, Google);
//   - programa los trabajos de los subagentes en el planificador.
import { registerAssetDirectory, registerMetricSource, registerRetention, registerSerpSource, registerScheduled, registerTools, setAgentJobCreator, setInboundHandler, type AgentTool, type ToolContext } from '@/lib/core/capabilities';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtMessages } from '@/lib/db/schema';
import { GOOGLE_METRIC_SOURCE, normalizeGoogleProperty } from '@/lib/agentes/metrics';
import { findCoreClient, primaryAsset } from '@/lib/core/clients';
import { handleInbound } from '@/lib/agentes/inbound';
import { createJob, encargarAgente, estadoTrabajos, runAgentJobs } from '@/lib/agentes/jobs';
import { ensureDefaultAgents } from '@/lib/agentes/store';
import { registerTeamCapabilities } from '@/lib/agentes/team';
import {
  clarityInsights,
  dataForSeoSerp,
  dataForSeoSerpResult,
  dataForSeoVolume,
  ga4Properties,
  ga4PropertyList,
  ga4Report,
  gbpLocationList,
  gbpLocations,
  gbpPerformance,
  gscPerformance,
  gscSiteList,
  gscSites,
  isConnected,
  type GoogleAsset
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

type AssetKindG = 'search_console' | 'analytics' | 'business_profile';
const KIND_TEXT: Record<AssetKindG, { name: string; list: string }> = {
  search_console: { name: 'propiedad de Search Console', list: 'gsc_propiedades' },
  analytics: { name: 'propiedad de Analytics', list: 'ga4_propiedades' },
  business_profile: { name: 'ficha de Business Profile', list: 'gbp_fichas' }
};

/**
 * Identificador a consultar: el que se pase explícito o, si se nombra un cliente, su cuenta PRINCIPAL de ese tipo en
 * la ficha (Clientes → Webs y cuentas). Así el agente no tiene que adivinar qué propiedad es de quién.
 */
export async function resolveGoogleId(ctx: ToolContext, kind: AssetKindG, explicit: string, cliente: string): Promise<{ id: string; who: string } | { error: string }> {
  if (explicit) return { id: explicit, who: '' };
  if (!cliente) return { error: `Di de qué cliente (cliente) o pasa la ${KIND_TEXT[kind].name} exacta (mírala con ${KIND_TEXT[kind].list}).` };
  const { client, options } = await findCoreClient(ctx.tenantId, cliente);
  if (!client) return { error: options.length ? `Hay varios clientes posibles: ${options.join(' | ')}. Pregunta cuál.` : `No encuentro el cliente «${cliente}».` };
  const a = await primaryAsset(ctx.tenantId, client.id, kind);
  if (!a?.value)
    return { error: `${client.name} no tiene ${KIND_TEXT[kind].name} en su ficha. Díselo a Enric: se asigna en Clientes → ${client.name} → Webs y cuentas → «Buscar en Google». No adivines cuál es.` };
  return { id: a.value, who: `${client.name}${a.access === 'no' ? ' (en la ficha consta «Sin acceso»)' : ''}: ` };
}

const withClient = (ctx: ToolContext, kind: AssetKindG, explicit: string, cliente: string, fn: (id: string) => Promise<string>) =>
  guard(async () => {
    const r = await resolveGoogleId(ctx, kind, explicit, cliente);
    if ('error' in r) throw new Error(r.error);
    return `${r.who}${await fn(r.id)}`;
  });

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
    description: 'Clics, impresiones, CTR y posición en Google de una web, por consulta, página, país, dispositivo o fecha. Lo normal es pasar «cliente» (nombre): se usa la propiedad de Search Console de su ficha. Solo si te dan otra web, «sitio» exactamente como sale en gsc_propiedades (p. ej. sc-domain:cliente.com).',
    risk: 'lectura',
    inputSchema: {
      type: 'object',
      properties: { cliente: { type: 'string', description: 'Nombre del cliente' }, sitio: { type: 'string' }, dias: { type: 'number', description: '7 a 480, por defecto 28' }, dimension: { type: 'string', enum: ['query', 'page', 'country', 'device', 'date'] }, pagina_contiene: { type: 'string' }, limite: { type: 'number' } },
      additionalProperties: false
    },
    available: (t) => isConnected(t, 'google'),
    run: (ctx, i) => withClient(ctx, 'search_console', s(i.sitio, 200), s(i.cliente, 120), (site) => gscPerformance(ctx.tenantId, normalizeGoogleProperty('gsc', site) ?? site, n(i.dias, 28, 7, 480), s(i.dimension, 10) || 'query', s(i.pagina_contiene, 200) || null, n(i.limite, 25, 5, 100)))
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
    description: 'Informe de Google Analytics 4: métricas (sessions, totalUsers, newUsers, keyEvents (conversiones), engagementRate, screenPageViews…) de los últimos N días, opcionalmente por una dimensión (sessionDefaultChannelGroup, pagePath, deviceCategory, country, date…). Lo normal es pasar «cliente»: se usa la propiedad de Analytics de su ficha.',
    risk: 'lectura',
    inputSchema: {
      type: 'object',
      properties: { cliente: { type: 'string', description: 'Nombre del cliente' }, propiedad: { type: 'string', description: 'Número de la propiedad (solo si no es la de la ficha del cliente)' }, dias: { type: 'number' }, metricas: { type: 'array', items: { type: 'string' } }, dimension: { type: 'string' } },
      additionalProperties: false
    },
    available: (t) => isConnected(t, 'google'),
    run: (ctx, i) =>
      withClient(ctx, 'analytics', s(i.propiedad, 40), s(i.cliente, 120), (prop) =>
        ga4Report(
          ctx.tenantId,
          prop,
          n(i.dias, 28, 1, 365),
          (Array.isArray(i.metricas) && i.metricas.length ? i.metricas : ['sessions', 'totalUsers', 'keyEvents']).map((m) => s(m, 60)).filter(Boolean),
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
  },
  {
    name: 'gbp_rendimiento',
    module: 'agentes',
    title: 'Business Profile: rendimiento',
    description: 'Rendimiento de la ficha de Google (Maps) de un cliente en los últimos N días: vistas en Búsqueda y Maps, llamadas, clics a la web, cómo llegar, mensajes y reservas. Pasa «cliente»: se usa la ficha de Business Profile de su ficha de cliente. Los datos llegan con unos 3 días de retraso.',
    risk: 'lectura',
    inputSchema: { type: 'object', properties: { cliente: { type: 'string', description: 'Nombre del cliente' }, ficha: { type: 'string', description: '«locations/…», solo si no es la de la ficha del cliente' }, dias: { type: 'number', description: '7 a 540, por defecto 28' } }, additionalProperties: false },
    available: (t) => isConnected(t, 'google'),
    run: (ctx, i) => withClient(ctx, 'business_profile', s(i.ficha, 80), s(i.cliente, 120), (loc) => gbpPerformance(ctx.tenantId, loc, n(i.dias, 28, 7, 540)))
  }
];

export const AGENTES_TOOLS: AgentTool[] = [encargarAgente, estadoTrabajos, ...INTEGRATION_TOOLS];

let done = false;
// Lo que ve la cuenta de Google conectada, para asignarlo a las fichas de cliente (lib/core/client-directory.ts).
async function listGoogleDirectory(tenantId: string): Promise<{ assets: GoogleAsset[]; okKinds: string[]; errors: string[] }> {
  const parts: [AssetKindG, string, (t: string) => Promise<GoogleAsset[]>][] = [
    ['search_console', 'Search Console', gscSiteList],
    ['analytics', 'Analytics', ga4PropertyList],
    ['business_profile', 'Business Profile', gbpLocationList]
  ];
  const out = { assets: [] as GoogleAsset[], okKinds: [] as string[], errors: [] as string[] };
  const settled = await Promise.allSettled(parts.map(([, , fn]) => fn(tenantId)));
  for (const [idx, r] of settled.entries()) {
    const [kind, label] = parts[idx];
    if (r.status === 'fulfilled') {
      out.assets.push(...r.value);
      out.okKinds.push(kind);
    } else {
      console.error(`[agentes] directorio Google ${label}:`, r.reason instanceof Error ? r.reason.message : r.reason);
      out.errors.push(`${label}: Google no dejó consultarlo`);
    }
  }
  return out;
}

export function registerAgentesCapabilities(): void {
  if (done) return;
  done = true;
  registerTools(AGENTES_TOOLS);
  registerTeamCapabilities(); // 20 nov 2026: jefe de Operaciones (dudas del equipo): herramientas, botones x:tq e informe
  setInboundHandler('agentes', handleInbound);
  // En segundo plano (17 nov 2026): un trabajo tarda minutos (varias vueltas con la IA) y bloqueaba el planificador entero
  // (avisos, bandeja de ClickUp, latido de salud → falsa alarma de «herramienta caída»). runAgentJobs ya tiene su candado.
  registerScheduled('trabajos de subagentes', async (tenantId) => {
    void runAgentJobs(tenantId).catch((e) => console.error('[agentes] trabajos de subagentes:', e instanceof Error ? e.message : e));
  });
  // Limpieza semanal (D5): los mensajes de conversaciones más antiguos que la retención del panel. La conversación queda,
  // vacía de lo antiguo; la memoria de cliente y las fichas no se tocan.
  registerRetention('agentes: mensajes', async (tenantId, cutoff) => {
    const r = await db.delete(agtMessages).where(and(eq(agtMessages.tenantId, tenantId), lt(agtMessages.createdAt, cutoff))).returning({ id: agtMessages.id });
    return r.length;
  });
  // El núcleo (registro de errores) encarga diagnósticos al Técnico de mantenimiento sin importar este módulo.
  setAgentJobCreator(async (r) => {
    // Los agentes por defecto (el Técnico de mantenimiento entre ellos) se crean al primer uso: asegurarlos antes.
    await ensureDefaultAgents(r.tenantId);
    const job = await createJob({ ...r, conversationId: null });
    return 'failure' in job ? { ok: false, error: job.failure } : { ok: true, id: job.id };
  });
  registerAssetDirectory({ provider: 'google', kinds: ['search_console', 'analytics', 'business_profile'], isConnected: (t) => isConnected(t, 'google'), list: listGoogleDirectory });
  // Histórico diario para el módulo Rendimiento (lib/rendimiento/sync.ts), sin que Rendimiento sepa de Google.
  registerMetricSource(GOOGLE_METRIC_SOURCE);
  // Resultados de Google por búsqueda (DataForSEO) para la competencia de SEO (Hito 2), sin que SEO sepa del proveedor.
  registerSerpSource({ isConnected: (t) => isConnected(t, 'dataforseo'), search: dataForSeoSerpResult });
}
