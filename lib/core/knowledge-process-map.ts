// Mapa Visual de la base de conocimiento (NÚCLEO, 20 nov 2026; nivel 3). Se registra en lib/architecture-map/registry.ts
// (detailMapId «conocimiento»). Diseño: docs/DISENO-JEFE-OPERACIONES.md (fase 1 construida; fases 2 y 3 pendientes).
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

export const CONOCIMIENTO_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'kb-entradas',
    lane: 'La base',
    name: 'Entradas de conocimiento',
    description:
      'Lo que la agencia sabe hacer y resolver: título, problema, solución con pasos, categoría, etiquetas y enlaces o vídeos (clip de ClickUp, Loom, Drive, YouTube). Estados: borrador, pendiente de revisar, para más tarde, publicada y archivada. Solo las publicadas las usan el equipo y los agentes.',
    status: 'built',
    file: 'lib/core/knowledge.ts',
    when: 'Al crear o editar una entrada en Conocimiento, al publicar una propuesta (pantalla o botón de Telegram) y cada vez que un agente busca en la base.',
    ai: 'Nada aquí (la redacción la hace el paso «Redactar con IA»).',
    code: 'Solo Enric publica (permiso admin en cada acción); el equipo solo lee las publicadas y propone. Nunca contraseñas ni claves (se rechaza el texto que lo parezca). Publicar exige título y solución. Las publicadas sin revisar en más de 12 meses se marcan para revisar («Sigue siendo válida» reinicia el plazo). Categorías editables (por defecto SEO, Google Ads, Webs WordPress, Contenidos, Operativa interna y Herramientas); archivar una no borra sus entradas.',
    tables: ['kb_articles', 'kb_categories'],
    to: ['kb-busqueda']
  },
  {
    id: 'kb-solicitud',
    lane: 'Entrar',
    name: 'Solicitudes del equipo y dictados',
    description:
      'Cualquier persona del equipo propone una entrada desde Conocimiento, con sus palabras y un enlace opcional. Enric también puede dictarla por Telegram al Operations manager («apunta en la base: …», herramienta guardar_conocimiento).',
    status: 'built',
    file: 'lib/core/knowledge.ts',
    when: 'Al pulsar «Enviar propuesta» en Conocimiento (permiso view) o cuando el agente usa guardar_conocimiento.',
    ai: 'La redacta (paso siguiente).',
    code: 'Mínimo 10 caracteres y sin contraseñas. Se guarda el texto original tal cual (request_text) y quién la pidió; los enlaces del texto no se pierden. Entra como «Pendiente de revisar».',
    tables: ['kb_articles'],
    to: ['kb-redactar']
  },
  {
    id: 'kb-redactar',
    lane: 'Entrar',
    name: 'Redactar con IA',
    description:
      'La IA convierte el texto libre en una entrada ordenada (título buscable, problema, pasos numerados, categoría, etiquetas y enlaces), generalizada sin datos de clientes ni personas. Si falta algo o ha quitado algo propio de un cliente, lo dice en una nota para Enric.',
    status: 'built',
    file: 'lib/core/knowledge.ts',
    when: 'Justo después de una solicitud o un dictado, cuando Enric pulsa «Cambiar» en Telegram y escribe qué cambiar, y con «Rehacer con mis cambios» o «Volver a redactar desde el original» en la ficha.',
    ai: 'Redacta la entrada a partir del texto (modelo configurado en IA y modelos; es poco volumen y es conocimiento que queda: se prioriza la calidad). Con una indicación de Enric, rehace la versión anterior aplicándola.',
    code: 'El texto va marcado como dato no fiable (no puede dar instrucciones). La salida se valida: sin título o sin solución no se usa; la categoría debe existir; etiquetas y enlaces se limpian. Aprender de las correcciones: se guarda la primera versión de la IA (ai_draft) y cada indicación de Enric con la versión anterior (edit_notes), para usarlas como ejemplos en la fase 2. Si la IA falla, la entrada queda con el texto original para editarla a mano.',
    prompts: ['kb_redactar_entrada'],
    tables: ['kb_articles', 'ai_prompts'],
    to: ['kb-revision']
  },
  {
    id: 'kb-revision',
    lane: 'Revisar',
    name: 'Revisión de Enric (Telegram y pantalla)',
    description:
      'A Enric le llega cada propuesta por Telegram con botones: ✅ Publicar · ✏️ Cambiar (escribe qué y la IA le pasa otra versión) · 🕓 Más tarde · 🗑 Descartar. En la herramienta, pestaña «Pendientes de revisar», con el texto original, el editor y «Rehacer con mis cambios».',
    status: 'built',
    file: 'lib/core/knowledge.ts',
    when: 'Cuando una propuesta queda redactada (o rehecha). En la pantalla, cuando Enric quiere.',
    ai: 'Solo al pulsar «Cambiar» (rehace la entrada con su indicación).',
    code: 'Botones «x:kb:…» registrados en el núcleo (registerModuleButtons); solo los acepta el dueño. El aviso sale por la cola de avisos (notifyOwner) con una clave por versión. «Cambiar» guarda el chat que espera la indicación (awaiting_chat_id) y Operaciones le entrega el siguiente mensaje. «Más tarde» manda la entrada a la cola de las horas de conocimiento; «Descartar» la archiva (se puede recuperar).',
    tables: ['kb_articles'],
    to: ['kb-entradas']
  },
  {
    id: 'kb-importar',
    lane: 'Entrar',
    name: 'Importar de ClickUp',
    description:
      'Importación del espacio «Base de Conocimiento» de ClickUp: cada tarea pasa a ser una entrada en «Para más tarde», con su descripción, la categoría según la carpeta o la lista y el enlace a la tarea original (los clips de vídeo adjuntos siguen allí).',
    status: 'built',
    file: 'lib/operaciones/kb-import.ts',
    when: 'Al pulsar «Importar de ClickUp» en Conocimiento (solo admin). Se puede repetir: lo ya importado no se duplica.',
    ai: 'Nada: la categoría sale del nombre de la carpeta o la lista (categoryFromClickUpName).',
    code: 'UNA consulta de workspace paginada (fetchSpaceTasksForKb) por el cliente con contador de lib/operaciones/clickup.ts; los espacios salen de la caché. Los adjuntos no se piden (sería una petición por tarea). Lo que parece llevar una contraseña no entra y se cuenta aparte. Es de Operaciones (sabe de ClickUp) y escribe en la base a través del núcleo (insertImportedArticles).',
    tables: ['kb_articles', 'ops_clickup_spaces'],
    to: ['kb-entradas']
  },
  {
    id: 'kb-busqueda',
    lane: 'Usar',
    name: 'Búsqueda (por significado y por palabras)',
    description:
      'Encuentra las entradas que se parecen a una pregunta aunque esté dicha con otras palabras, y también por términos exactos («Rank Math», «404»). La usan el buscador de Conocimiento y la herramienta buscar_conocimiento de los agentes.',
    status: 'built',
    file: 'lib/core/knowledge.ts',
    when: 'Al buscar en Conocimiento y cuando un agente usa buscar_conocimiento (hoy el Operations manager; en la fase 2, el jefe de Operaciones con las dudas del equipo).',
    ai: 'Nada de IA de texto: solo embeddings (vectores de significado), que cuestan céntimos por miles de búsquedas.',
    code: 'Híbrida: embeddings con pgvector (distancia coseno < 0,6) + texto completo en español (índice GIN) + título y etiquetas, unidos con Reciprocal Rank Fusion (fuseRankings); lo que el equipo marcó como útil sube un poco. Los agentes solo ven entradas publicadas y cuentan un uso. Sin proveedor de embeddings, busca solo por palabras (avisa una vez).',
    tables: ['kb_articles'],
    to: ['kb-embeddings']
  },
  {
    id: 'kb-embeddings',
    lane: 'Usar',
    name: 'Embeddings pendientes',
    description: 'Calcula el vector de significado de las entradas nuevas o cambiadas, y de todas si cambia el modelo de embeddings.',
    status: 'built',
    file: 'lib/core/knowledge.ts',
    when: 'Al guardar una entrada (en segundo plano), tras importar y en cada pasada del planificador (tarea «base de conocimiento» del registro del núcleo), 40 por pasada.',
    ai: 'Embeddings del proveedor configurado en IA y modelos (el de embeddings o, si no hay, el de chat).',
    code: 'Sin entradas no mira la configuración de IA. Guarda el modelo con el que se calculó cada vector y solo compara vectores del mismo modelo. Un fallo del proveedor se avisa como mucho una vez por hora.',
    tables: ['kb_articles']
  },
  {
    id: 'kb-mapa-contenido',
    lane: 'Relacionado',
    name: 'Mapa de contenido del cliente',
    description:
      'En la ficha de los clientes con servicio SEO, acceso directo al Google Sheet del mapa de contenido que lleva Mayi (artículos, URLs transaccionales, enlazado, pilares y satélites). Es una cuenta más en «Webs y cuentas» (tipo «Mapa de contenido»).',
    status: 'built',
    file: 'app/(dashboard)/dashboard/clientes/[id]/ficha-view.tsx',
    when: 'Al abrir la ficha de un cliente con SEO; se añade o cambia en «Webs y cuentas».',
    ai: 'Nada (más adelante, el jefe de Operaciones y el estratega podrán leer el Sheet).',
    code: 'Tipo mapa_contenido en client_assets (migración 0056). Si el cliente tiene SEO y no hay mapa, la cabecera invita a añadirlo. Los agentes lo ven con ficha_cliente, como el resto de cuentas.',
    tables: ['client_assets']
  },
  {
    id: 'kb-fase2',
    lane: 'Próximamente',
    name: 'Jefe de Operaciones: dudas del equipo',
    description:
      'Fase 2: el equipo pregunta por su chat de siempre y el jefe responde con la ficha del cliente, la base y los casos anteriores; si no hay nada, con IA general (con aprobación de Enric la primera semana). «No me sirve / ya lo probé» lo escala a Enric, y su respuesta se convierte en una entrada propuesta.',
    status: 'planned',
    file: 'docs/DISENO-JEFE-OPERACIONES.md',
    when: 'Pendiente de construir.',
    ai: 'Clasificar el mensaje (Haiku) y redactar la respuesta (Sonnet).',
    code: 'Por diseñar el esquema de preguntas del equipo (necesita OK de Enric).'
  }
];
