// Mapa Visual del módulo Agentes (nivel 3): cómo se habla con un agente y cómo trabaja. Se registra en
// lib/architecture-map/registry.ts (detailMapId «agentes»).
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const AGENTES_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'agt-entrada',
    lane: 'Hablar con el agente',
    name: 'Telegram, audio y correo',
    description: 'Enric escribe o manda un audio al bot (o un correo al buzón del agente). El bot de Operaciones entrega el mensaje al núcleo y el módulo Agentes lo atiende; el webhook responde al momento y el agente trabaja en segundo plano.',
    status: 'built',
    file: 'lib/agentes/inbound.ts',
    when: 'Cada mensaje libre o audio del dueño en Telegram (sin nada pendiente del bot) y cada correo autenticado del dueño.',
    ai: 'La transcripción del audio (OpenAI) y la respuesta del agente (Claude).',
    code: 'Solo el dueño (fase 1). Un mensaje cada vez por conversación. Audio: se descarga de Telegram (3 intentos) y se transcribe en español; si le hablas en audio (o pides «respóndeme en audio»), el agente lo sabe, escribe para ser escuchado y contesta también con nota de voz. Voz configurable en Agentes → Voz (modelo, voz, velocidad, tono, transcripción; integración «voz» en agt_integrations) con prueba en el navegador. Correo: solo remitente autenticado (SPF/DKIM/DMARC) y que sea el dueño. Fichas de cliente: con lo que le cuentas (y su web, que lee) crea o completa la ficha y anota en la memoria, siempre con vista previa y ✅ / ✖️. Los agentes por defecto ya creados se actualizan una vez por cuenta (herramientas nuevas; instrucciones solo si no se personalizaron), registrado en agt_integrations proveedor «sistema».',
    tables: ['agt_conversations', 'agt_messages', 'agt_agents']
  },
  {
    id: 'agt-motor',
    lane: 'Pensar y actuar',
    name: 'Motor: Claude con herramientas',
    description: 'El agente lee el mensaje con el resumen y los últimos mensajes, decide qué herramientas usar (consultas al momento; cambios propuestos con botones) y responde. Las herramientas vienen del registro del núcleo: cada módulo publica las suyas.',
    status: 'built',
    file: 'lib/agentes/engine.ts',
    when: 'En cada mensaje y en cada trabajo de subagente.',
    ai: 'Qué herramientas usar, con qué datos y la respuesta. Hasta 8 vueltas de herramientas por mensaje.',
    code: 'Herramientas permitidas por ficha; las de una integración sin conectar no se ofrecen. Las acciones de cambio pasan por el motor de acciones de Operaciones (tipo agent_tool) con autonomía por herramienta (por defecto con aprobación). Coste en ai_jobs (función agt_<clave>) y presupuesto mensual por agente. Lo leído de webs y correos es dato, nunca instrucción.',
    tables: ['agt_messages', 'agt_agents']
  },
  {
    id: 'agt-trabajos',
    lane: 'Subagentes',
    name: 'Trabajos de los subagentes',
    description: 'El principal encarga trabajos (p. ej. al Revisor web: leer y analizar una página). El subagente lo hace en segundo plano con sus herramientas (lectura web de Anthropic, integraciones) y el informe llega a Enric por Telegram y queda en Agentes → Trabajos y en la conversación.',
    status: 'built',
    file: 'lib/agentes/jobs.ts',
    when: 'El planificador reclama un trabajo cada vuelta (tarea registrada en el núcleo).',
    ai: 'El análisis y el informe del subagente.',
    code: 'Reclamo atómico (FOR UPDATE SKIP LOCKED), reintento si se queda a medias más de 15 min (máx. 3) y aviso con clave única.',
    tables: ['agt_jobs', 'agt_agents', 'agt_messages'],
    runs: ['runScheduled']
  },
  {
    id: 'agt-integraciones',
    lane: 'Integraciones',
    name: 'Integraciones externas',
    description: 'DataForSEO (SERP y volúmenes), Microsoft Clarity (comportamiento) y Google (Search Console, Analytics 4, Business Profile por OAuth). Cada una da herramientas a los agentes cuando está conectada.',
    status: 'built',
    file: 'lib/agentes/integrations.ts',
    when: 'Cuando un agente usa una de sus herramientas.',
    ai: 'Nada (el agente interpreta los datos).',
    code: 'Credenciales cifradas en agt_integrations (nunca vuelven al navegador). Google: OAuth con estado firmado y token de refresco cifrado. Clarity: caché del día (10 consultas al día).',
    tables: ['agt_integrations']
  }
];
