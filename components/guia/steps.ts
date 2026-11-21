// Pasos de la visita guiada (fase 5 de la reorganización UX, 21 nov 2026). Cada paso señala una parte de la pantalla
// (selector CSS) y explica para qué sirve con un texto que se entiende solo, sin depender de lo que hay alrededor.
// Un paso sin `target` va centrado. Si el elemento de un paso no existe para ese usuario (p. ej. una entrada solo de
// admin), el paso se salta. Hay una visita para administración y otra para el equipo.
export type TourStep = {
  id: string;
  target?: string;
  title: string;
  body: string;
  /** Hacia dónde se abre la ventanita respecto al elemento. */
  placement?: 'right' | 'bottom' | 'left' | 'top';
};

export const nav = (href: string) => `[data-tour="nav:${href}"]`;

const COMMON_END: TourStep[] = [
  {
    id: 'nuevo',
    target: '[data-tour="nuevo"]',
    title: 'Crear algo nuevo',
    body: 'El botón «Nuevo» sirve para crear una nota, un encargo, un cliente o un proyecto SEO sin tener que saber en qué sección vive cada cosa.',
    placement: 'right'
  },
  {
    id: 'buscar',
    target: '[data-tour="buscar"]',
    title: 'Buscar y saltar a cualquier sitio',
    body: 'Escribe lo que buscas (una pantalla, un cliente, «nuevo encargo»…) y ve directo. También se abre con Ctrl+K desde cualquier pantalla.',
    placement: 'right'
  },
  {
    id: 'ayuda',
    target: '[data-tour="ayuda"]',
    title: 'Ayuda siempre a mano',
    body: 'En este botón puedes volver a ver esta guía cuando quieras, buscar ayuda sobre la pantalla en la que estás y abrir el glosario con lo que significa cada término.',
    placement: 'bottom'
  }
];

export const ADMIN_TOUR: TourStep[] = [
  {
    id: 'hola',
    title: 'Bienvenido a la herramienta de Kijutech',
    body: 'En un minuto te enseño dónde está cada cosa. Puedes avanzar con «Siguiente» o con las flechas del teclado, y salir cuando quieras con «Saltar» o Esc.'
  },
  {
    id: 'pendiente',
    target: '[data-testid="inicio-pendiente"]',
    title: 'Lo que espera de ti',
    body: 'Arriba del Inicio está todo lo que necesita una decisión tuya: bloqueos, revisiones, correos, dudas escaladas y propuestas. Lo urgente va primero. Debajo, una tarjeta por área.',
    placement: 'bottom'
  },
  {
    id: 'para-ti',
    target: nav('/dashboard/para-ti'),
    title: 'Para ti: la bandeja única',
    body: 'Todo lo pendiente en una sola lista, con filtros por departamento y tipo. Las revisiones y los bloqueos se deciden ahí mismo. El número indica cuántas cosas esperan; si está en rojo, alguna es urgente.',
    placement: 'right'
  },
  {
    id: 'mis-tareas',
    target: nav('/dashboard/mis-tareas'),
    title: 'Mis tareas',
    body: 'Tus tareas por fecha: vencidas, de hoy, de la semana y las que no tienen fecha.',
    placement: 'right'
  },
  {
    id: 'clientes',
    target: nav('/dashboard/clientes'),
    title: 'Clientes',
    body: 'Cada cliente tiene su ficha con todo lo suyo: encargos, rendimiento web, estrategia y SEO. Arriba de Clientes están también las vistas de todos los clientes juntos.',
    placement: 'right'
  },
  {
    id: 'equipo',
    target: nav('/dashboard/equipo'),
    title: 'Equipo: personas y agentes de IA',
    body: 'El organigrama con personas y agentes juntos, qué está haciendo cada uno y lo que ha pasado hoy. Desde la ficha de cada persona eliges su departamento y su foto.',
    placement: 'right'
  },
  {
    id: 'conocimiento',
    target: nav('/dashboard/conocimiento'),
    title: 'Conocimiento',
    body: 'Lo que la agencia sabe hacer y resolver: procedimientos, soluciones y vídeos. Es lo que consulta el jefe de operaciones para responder al equipo.',
    placement: 'right'
  },
  {
    id: 'ajustes',
    target: nav('/dashboard/operaciones/automatizaciones'),
    title: 'Ajustes',
    body: 'Lo técnico vive abajo, separado del día a día: automatizaciones, Telegram, ClickUp, salud del sistema, gasto de IA y usuarios.',
    placement: 'right'
  },
  ...COMMON_END
];

export const TEAM_TOUR: TourStep[] = [
  {
    id: 'hola',
    title: 'Bienvenido a la herramienta de Kijutech',
    body: 'En un minuto te enseño dónde está cada cosa. Avanza con «Siguiente» o con las flechas del teclado, y sal cuando quieras con «Saltar» o Esc.'
  },
  {
    id: 'urgente',
    target: '[data-testid="inicio-urgente"]',
    title: 'Lo urgente',
    body: 'Lo primero que ves al entrar: encargos que te han devuelto, bloqueos que esperan respuesta y respuestas a tus dudas que aún no has valorado.',
    placement: 'bottom'
  },
  {
    id: 'tu-dia',
    target: '[data-testid="inicio-mis-tareas"]',
    title: 'Tu día',
    body: 'Tus tareas vencidas y las de hoy, con su enlace. Encima tienes cómo vas esta semana: solo lo ves tú y sirve para mejorar, no para compararte.',
    placement: 'top'
  },
  {
    id: 'mis-tareas',
    target: nav('/dashboard/mis-tareas'),
    title: 'Mis tareas',
    body: 'Todas tus tareas por fecha: vencidas, de hoy, de la semana y cuántas no tienen fecha. Empezar y terminar una tarea se sigue haciendo desde Telegram.',
    placement: 'right'
  },
  {
    id: 'clientes',
    target: nav('/dashboard/clientes'),
    title: 'Clientes',
    body: 'La ficha de cada cliente: sus datos, sus encargos, su rendimiento web y su estrategia.',
    placement: 'right'
  },
  {
    id: 'equipo',
    target: nav('/dashboard/equipo'),
    title: 'Equipo',
    body: 'El organigrama con las personas y los agentes de IA. Desde tu ficha puedes subir tu foto.',
    placement: 'right'
  },
  {
    id: 'conocimiento',
    target: nav('/dashboard/conocimiento'),
    title: 'Conocimiento',
    body: 'Cómo se hace cada cosa en la agencia. Si tienes una duda, también puedes preguntarle al jefe de operaciones por tu chat de Telegram: busca aquí la respuesta.',
    placement: 'right'
  },
  ...COMMON_END
];

/** Pasos que se pueden mostrar: los que no señalan nada o cuyo elemento existe en la pantalla. */
export function availableSteps(steps: TourStep[], exists: (selector: string) => boolean): TourStep[] {
  return steps.filter((s) => !s.target || exists(s.target));
}

/** Clave local de «ya la vio» (por usuario y versión de la guía: si la guía cambia mucho, se sube la versión). */
export const tourSeenKey = (userId: number) => `kijutech:guia:v1:${userId}`;
