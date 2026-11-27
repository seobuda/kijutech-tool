import 'server-only';
import { registerConnectionJobs } from '@/lib/core/connections';
import { registerUsageRetention } from '@/lib/core/usage';

// Núcleo: alta de los cimientos de la plataforma al arrancar (cimientos, 23 nov 2026). Lo llama wireApp().
// Registra en la cola los trabajos del núcleo (envío de mensajes a clientes, descarga de Search Console, rastreo), la
// limpieza de trabajos viejos y la herramienta de los agentes para escribir a un cliente (siempre por la política de
// aprobación y con los destinatarios que decide la regla, nunca con direcciones que elija el agente).
import { registerHealthCheck, registerRetention, registerTools, type AgentTool } from '@/lib/core/capabilities';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { purgeOldJobs } from '@/lib/core/jobs';
import { createClientMessage, registerCommsJobs } from '@/lib/core/comms';
import { COMMS_KINDS, type CommsKind } from '@/lib/core/comms-rules';
import { registerGscJobs } from '@/lib/core/gsc';
import { registerCrawlJobs } from '@/lib/core/crawler';
import { registerInterventionJobs } from '@/lib/core/interventions';
import { registerMeasureJobs } from '@/lib/core/measure';
import { registerQuestionsJobs } from '@/lib/core/questions';
import { registerFeedEvents } from '@/lib/core/knowledge-feed';
import { findCoreClient } from '@/lib/core/clients';

const escribirAlCliente: AgentTool = {
  name: 'escribir_al_cliente',
  module: 'nucleo',
  title: 'Escribir a un cliente',
  description:
    'Prepara un correo para un cliente (una pregunta, un aviso, un informe o una petición de aprobación). Los destinatarios los elige el sistema según lo que recibe cada contacto de la ficha; si no hay ninguno, lo dice y hay que añadir el contacto. Por defecto pasa por la aprobación de Enric antes de salir.',
  risk: 'cambio',
  inputSchema: {
    type: 'object',
    properties: {
      cliente: { type: 'string', description: 'Nombre del cliente' },
      tipo: { type: 'string', enum: [...COMMS_KINDS], description: 'informes | preguntas | avisos | aprobaciones | facturacion' },
      asunto: { type: 'string' },
      texto: { type: 'string', description: 'El correo completo, en texto, tal como lo leerá el cliente' }
    },
    required: ['cliente', 'tipo', 'asunto', 'texto'],
    additionalProperties: false
  },
  async run(ctx, input) {
    const { client, options } = await findCoreClient(ctx.tenantId, String(input.cliente ?? ''));
    if (!client) return { ok: false, content: `No sé a qué cliente te refieres.${options.length ? ` Opciones: ${options.slice(0, 8).join(', ')}` : ''}` };
    const kind = String(input.tipo ?? '') as CommsKind;
    const r = await createClientMessage({
      tenantId: ctx.tenantId,
      clientId: client.id,
      kind,
      subject: String(input.asunto ?? ''),
      body: String(input.texto ?? ''),
      author: { kind: 'agente', name: `Agente (${ctx.agentKey})`, agentKey: ctx.agentKey },
      // Si el turno ha leído webs, nunca sale solo (un texto de fuera podría pedirlo).
      forceApproval: ctx.untrustedInput === true
    });
    if (!r.ok) return { ok: false, content: r.detail };
    return {
      ok: true,
      proposed: r.status === 'pendiente_aprobacion',
      content:
        r.status === 'pendiente_aprobacion'
          ? `Correo preparado para ${r.recipients.join(', ')}: espera la aprobación de Enric (Para ti o Telegram). No ha salido todavía: dilo así.`
          : `Correo enviado (en cola) a ${r.recipients.join(', ')}.`
    };
  }
};

let done = false;
export function registerPlatformCapabilities(): void {
  if (done) return;
  done = true;
  registerCommsJobs();
  registerGscJobs();
  registerCrawlJobs();
  registerMeasureJobs(); // SEO parte 8: medir si funcionaron las intervenciones (diario por cuenta)
  registerInterventionJobs(); // Hito 1 SEO: fecha de «hecho» de las intervenciones (cada hora)
  registerQuestionsJobs(); // 25 nov 2026: preguntas al cliente (leer respuestas, envío automático y pasada diaria)
  registerConnectionJobs(); // 27 nov 2026: leads de GoHighLevel de cada cliente (cada día)
  registerUsageRetention(); // 27 nov 2026: uso de las pantallas (línea base del rediseño de UX)
  registerFeedEvents(); // Hito 1 SEO: actualizaciones e incidencias de Google como eventos externos
  registerTools([escribirAlCliente]);
  // Trabajos terminados de la cola: se borran con la limpieza semanal (los fallidos se guardan el doble de tiempo).
  registerRetention('núcleo: trabajos de la cola', (tenantId, cutoff) => purgeOldJobs(tenantId, cutoff));
  // Salud: si hay trabajos esperando mucho, el trabajador está parado; si fallan, se ve aquí.
  registerHealthCheck('plataforma', async (tenantId) => {
    const [r] = (await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'pendiente' AND run_at < now() - interval '30 minutes')::int AS late,
        count(*) FILTER (WHERE status = 'fallido' AND finished_at > now() - interval '24 hours')::int AS failed,
        max(kind) FILTER (WHERE status = 'fallido' AND finished_at > now() - interval '24 hours') AS failed_kind
      FROM jobs WHERE tenant_id = ${tenantId}`)) as unknown as { late: number; failed: number; failed_kind: string | null }[];
    const late = Number(r?.late ?? 0);
    const failed = Number(r?.failed ?? 0);
    return [
      {
        key: 'cola-trabajos',
        label: 'Cola de trabajos',
        status: late > 0 ? 'critico' : failed > 0 ? 'aviso' : 'ok',
        detail: late > 0 ? `${late} trabajo(s) esperan más de 30 min` : failed > 0 ? `${failed} fallido(s) en 24 h (p. ej. ${r?.failed_kind ?? '—'})` : 'Al día',
        recommendation: late > 0 ? 'El trabajador (contenedor kijutech_worker) parece parado: revisa server-status.sh o reinícialo.' : failed > 0 ? 'Mira el error del trabajo en la tabla jobs (last_error).' : ''
      }
    ];
  });
}
