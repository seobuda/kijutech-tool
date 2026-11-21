// Glosario de la herramienta (fase 5 UX, 21 nov 2026): un nombre por concepto. Si se cambia el nombre de algo en la
// interfaz, se cambia también aquí (tests/ayuda.test.ts comprueba que los enlaces llevan a páginas que existen).
export type GlossaryTerm = { term: string; meaning: string; href?: string };

export const GLOSSARY: { group: string; terms: GlossaryTerm[] }[] = [
  {
    group: 'Los espacios',
    terms: [
      { term: 'Inicio', href: '/dashboard', meaning: 'La portada: lo urgente y cómo va todo hoy. Cada persona ve la suya según su rol.' },
      { term: 'Mis tareas', href: '/dashboard/mis-tareas', meaning: 'Todas tus tareas por fecha: vencidas, de hoy, de la semana, más adelante y cuántas no tienen fecha.' },
      { term: 'Para ti', href: '/dashboard/para-ti', meaning: 'La bandeja única de administración: todo lo que espera una decisión, lo urgente primero.' },
      { term: 'Clientes', href: '/dashboard/clientes', meaning: 'Las fichas de los clientes. Cada ficha reúne sus encargos, su rendimiento web, su estrategia y su SEO.' },
      { term: 'Equipo', href: '/dashboard/equipo', meaning: 'El organigrama con personas y agentes de IA juntos, qué está haciendo cada uno y la actividad de hoy.' },
      { term: 'Conocimiento', href: '/dashboard/conocimiento', meaning: 'Lo que la agencia sabe hacer y resolver: procedimientos, soluciones y vídeos.' },
      { term: 'Ajustes', meaning: 'Lo técnico, solo para administración: automatizaciones, Telegram, ClickUp, salud del sistema, gasto de IA y usuarios.' }
    ]
  },
  {
    group: 'El trabajo',
    terms: [
      { term: 'Encargo', href: '/dashboard/operaciones/encargos', meaning: 'Una tarea creada desde la herramienta (Bloc de notas, «Nuevo encargo» o Telegram) que vive también en ClickUp.' },
      { term: 'Bloc de notas', href: '/dashboard/operaciones', meaning: 'Donde se escribe o dicta una idea; el agente la convierte en encargos.' },
      { term: 'Bloqueo', meaning: 'Cuando alguien no puede seguir con una tarea y pulsa «Bloqueado» en Telegram. Primero intenta resolverlo el agente; si no puede, pasa a Enric.' },
      { term: 'Revisión', meaning: 'Un encargo terminado que alguien tiene que aceptar o devolver antes de darlo por hecho.' },
      { term: 'Devuelto', meaning: 'Un encargo que en la revisión necesitaba cambios: vuelve a quien lo hizo con un comentario.' },
      { term: 'Vencida', meaning: 'Una tarea cuya fecha de entrega ya ha pasado sin terminarse.' },
      { term: 'Jornada', href: '/dashboard/operaciones/jornada', meaning: 'El registro del día de cada persona: empieza con la primera tarea y lleva descansos, comida y salida.' },
      { term: 'Margen', href: '/dashboard/operaciones/tiempos', meaning: 'El tiempo razonable para cada tipo de tarea. «Dentro del margen» quiere decir que se hizo en ese tiempo.' },
      { term: 'Precisión', meaning: 'Cuánto aciertas cuando estimas lo que vas a tardar en una tarea. Solo la ves tú.' }
    ]
  },
  {
    group: 'Los clientes',
    terms: [
      { term: 'Ficha del cliente', meaning: 'Todo lo de un cliente: datos, contactos, webs y cuentas, competencia, memoria, encargos, rendimiento, estrategia y SEO.' },
      { term: 'Semáforo', meaning: 'Rojo si un cliente lleva demasiado sin actividad; ámbar si no tiene trabajo planificado; verde si está al día.' },
      { term: 'Nivel del cliente', meaning: 'Su importancia (por ejemplo, Top): decide cada cuánto tiene que haber actividad y la prioridad de sus correos.' },
      { term: 'Memoria', meaning: 'Lo que hay que recordar de un cliente (preferencias, avisos, acuerdos). El agente propone y una persona acepta.' },
      { term: 'Rendimiento web', href: '/dashboard/rendimiento', meaning: 'Clics de Google, sesiones, conversiones y ficha de Google de cada cliente, con su histórico.' },
      { term: 'Estrategia', href: '/dashboard/estrategia', meaning: 'Los objetivos de cada cliente, su seguimiento y las propuestas del estratega.' },
      { term: 'Estratega', meaning: 'El agente que analiza cada cliente y propone qué trabajo hacer; tú apruebas, ajustas o rechazas.' },
      { term: 'Proyecto SEO', href: '/dashboard/projects', meaning: 'El trabajo SEO de un cliente: palabras clave, clusters, competidores y auditoría.' }
    ]
  },
  {
    group: 'Los agentes de IA',
    terms: [
      { term: 'Agente', meaning: 'Un miembro del equipo hecho con IA, con su rol, sus instrucciones, sus herramientas y su presupuesto.' },
      { term: 'Operations manager', meaning: 'El agente principal: lleva el día a día, habla con Enric por Telegram y correo y reparte trabajo.' },
      { term: 'Jefe de departamento', meaning: 'Un agente que dirige un departamento (Operaciones, Sistema…) y revisa el trabajo de los suyos.' },
      { term: 'Jefe de operaciones', meaning: 'El agente que responde las dudas del equipo por su chat, con la ficha, la base de conocimiento y los casos resueltos.' },
      { term: 'Subagente', meaning: 'Un agente especialista al que otro encarga un trabajo concreto (revisar una web, diagnosticar un error…).' },
      { term: 'Departamento', href: '/dashboard/equipo', meaning: 'Una parte de la agencia con su jefe: Gabinete, Operaciones, Cuentas y Estrategia, Sistema y Seguridad.' },
      { term: 'Propuesta', meaning: 'Algo que un agente quiere hacer y espera tu aprobación. Se ve en Para ti y llega por Telegram.' },
      { term: 'Autonomía', meaning: 'Hasta dónde puede actuar un agente solo: en sombra (solo propone), con aprobación o autónomo.' },
      { term: 'Acierto', meaning: 'Qué parte de las propuestas de un agente se aprobaron tal cual en los últimos 30 días.' }
    ]
  },
  {
    group: 'Herramientas conectadas',
    terms: [
      { term: 'ClickUp', meaning: 'Donde viven hoy las tareas. La herramienta lo irá sustituyendo; por ahora lee y escribe en él.' },
      { term: 'Telegram', meaning: 'El canal del día a día: avisos, botones de Empezar, Hecho o Bloqueado, y las conversaciones con los agentes.' },
      { term: 'Automatizaciones', href: '/dashboard/operaciones/automatizaciones', meaning: 'Lo que la herramienta hace sola a su hora (recordatorios, resúmenes, avisos), con su interruptor y sus valores.' }
    ]
  }
];
