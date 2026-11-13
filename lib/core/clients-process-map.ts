// Mapa Visual de la ficha del cliente (NÚCLEO, 14 nov 2026; nivel 3). Se registra en lib/architecture-map/registry.ts
// (detailMapId «clientes»). Diseño: docs/DISENO-FICHA-CLIENTE.md.
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const CLIENTES_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'cli-ficha',
    lane: 'La ficha',
    name: 'Ficha del cliente (núcleo)',
    description:
      'Toda la información del cliente en un sitio: identidad y estado (prospecto, onboarding, activo, pausado, baja), empresa, negocio, objetivos y estrategia, y contrato. La ven todos los módulos; Operaciones guarda aparte sus ajustes con el mismo id.',
    status: 'built',
    file: 'lib/core/clients.ts',
    when: 'Al crear o editar un cliente en Clientes, al aprobar una propuesta del agente o de «Rellenar con IA», y cada vez que un módulo necesita saber algo del cliente.',
    ai: 'Nada aquí (la redacción la hacen el agente o «Rellenar con IA», y esto solo valida y guarda).',
    code: 'Nombre único por cuenta (sin tildes ni mayúsculas). Fechas de alta y baja automáticas al cambiar el estado (con motivo de baja). Nunca contraseñas. El contrato (cuota, fechas) solo lo ve y edita un administrador (acción aparte con permiso admin; la ficha no lo envía al navegador de un editor). Borrar pregunta antes a los módulos (registro del núcleo: Operaciones lo impide si hay encargos) y arrastra todo lo del cliente.',
    tables: ['clients', 'ops_clients']
  },
  {
    id: 'cli-contactos',
    lane: 'La ficha',
    name: 'Contactos y locales',
    description: 'Personas del cliente con cargo, rol (decide, facturación, técnico, marketing), correo, teléfono, WhatsApp, canal preferido y quién es el principal; y sus locales o sedes con dirección, teléfono y horario.',
    status: 'built',
    file: 'lib/core/clients.ts',
    when: 'Desde la pestaña «Contactos» de la ficha, al aprobar una propuesta, y al asignar un correo a un cliente desde Correos (el remitente pasa a ser contacto).',
    ai: 'Nada aquí.',
    code: 'Un correo solo puede ser de un contacto de la cuenta (índice único). El primer contacto y el primer local quedan como principales; marcar otro quita la marca al anterior. Los correos de los contactos activos sirven para reconocer de qué cliente es un email (matchSender: dirección exacta > dominio; si dos clientes reclaman lo mismo, no adivina). Borrar un contacto de verdad es de administrador; un editor lo marca inactivo.',
    tables: ['client_contacts', 'client_locations']
  },
  {
    id: 'cli-webs',
    lane: 'La ficha',
    name: 'Webs y cuentas',
    description: 'Webs, dominios y cuentas del cliente (Search Console, Analytics, ficha de Google, Ads, redes, tienda, CRM) con si tenemos acceso y dónde están los accesos, y qué pueden hacer los agentes con ellas.',
    status: 'built',
    file: 'lib/core/clients.ts',
    when: 'Desde la pestaña «Webs y cuentas» y al aprobar una propuesta. Las integraciones de los agentes usarán la cuenta principal de cada tipo (primaryAsset).',
    ai: 'Nada aquí.',
    code: 'Nunca contraseñas (se rechaza cualquier texto que lo parezca). Una web o dominio puede «reconocer correos» de su dominio (email_domain, único por cuenta; nunca gmail.com y similares). La primera de cada tipo queda como principal. La ficha muestra qué integraciones están disponibles para el cliente según sus cuentas y lo conectado en Agentes → Integraciones.',
    tables: ['client_assets']
  },
  {
    id: 'cli-competencia',
    lane: 'La ficha',
    name: 'Competencia',
    description: 'Con quién compite el cliente (nombre, dominio y notas). Los que propone un agente quedan marcados.',
    status: 'built',
    file: 'lib/core/clients.ts',
    when: 'Desde la pestaña «Competencia» y al aprobar una propuesta. La usará el analista de competencia del onboarding.',
    ai: 'Nada aquí.',
    code: 'Dominio normalizado. Origen manual o agente.',
    tables: ['client_competitors']
  },
  {
    id: 'cli-memoria',
    lane: 'La ficha',
    name: 'Memoria del cliente',
    description: 'Lo que hay que recordar siempre: preferencias, promesas, decisiones, restricciones y contexto. Solo lo aceptado se usa como contexto (correos, encargos, agentes).',
    status: 'built',
    file: 'lib/core/client-memory-actions.ts',
    when: 'A mano desde la pestaña «Memoria», por el agente (anotar_memoria_cliente) o al aprobar una propuesta.',
    ai: 'Lo que propone la IA entra como «propuesto» y una persona lo acepta; lo que dicta Enric al agente y aprueba entra aceptado con origen «agente».',
    code: 'Máx. 1000 caracteres y sin contraseñas. Descartar lo puede hacer un editor; borrar de verdad, solo un administrador.',
    tables: ['client_memory']
  },
  {
    id: 'cli-completitud',
    lane: 'Completar la ficha',
    name: 'Completitud',
    description: 'Qué le falta a cada ficha para que el equipo y los agentes trabajen sin preguntar (negocio, objetivos, contacto, web, Search Console…), con un porcentaje en la lista y en la ficha.',
    status: 'built',
    file: 'lib/core/client-rules.ts',
    when: 'Al pintar la lista y la ficha, y en el texto de la ficha que lee el agente (así pregunta lo que falta).',
    ai: 'Nada: es un cálculo con pesos (lo esencial pesa más).',
    code: 'completeness(): 14 comprobaciones con peso 1–3. Se presenta como progreso (verde desde el 80 %), no como reproche.',
    tables: ['clients', 'client_contacts', 'client_locations', 'client_assets', 'client_competitors']
  },
  {
    id: 'cli-propuestas',
    lane: 'Completar la ficha',
    name: 'Propuestas de la IA (agente y «Rellenar con IA»)',
    description: 'Lo que cuenta Enric (texto o audio, por Telegram o en la ficha) se convierte en un plan validado: cada dato a su sitio (contactos, locales, webs, competencia, memoria, nivel y servicios), con vista previa, y se guarda solo al aprobar.',
    status: 'built',
    file: 'lib/operaciones/client-write.ts',
    when: 'Herramientas crear_cliente y actualizar_cliente del agente (con ✅ / ✖️ en Telegram) y botón «Rellenar con IA» de la lista y de la ficha («Proponer» → «Aplicar»).',
    ai: 'El agente (Claude) redacta los campos con lo que le cuentan y lo que lee en la web del cliente; en la web, el prompt ops_client_fill v2 propone la ficha completa.',
    code: 'Valida contra niveles, servicios, personas y opciones de ClickUp; rechaza contraseñas y duplicados; al editar, los textos se reemplazan y las listas se suman (un contacto con el mismo correo o nombre se completa); quitar es explícito. El contrato solo si quien propone es el dueño o un administrador. Al aplicar en la web se vuelve a validar en el servidor. Lo que falle (p. ej. un correo de otro cliente) se informa sin deshacer el resto.',
    prompts: ['ops_client_fill'],
    tables: ['clients', 'client_contacts', 'client_locations', 'client_assets', 'client_competitors', 'client_memory', 'ops_clients', 'ops_client_services']
  }
];
