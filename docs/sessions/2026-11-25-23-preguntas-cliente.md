# Preguntas al cliente: banco por servicio, pestaña en la ficha, cuestionario en línea
**Fecha:** 2026-11-25  
**Rama:** feature/preguntas-cliente  
**Commit:** f375243e

## Qué se construyó
Diseño y alternativas en `docs/DISENO-PREGUNTAS-CLIENTE.md`. ESTADO §6.40.

**Núcleo:**
- **`lib/db/schema.ts`**: cuatro tablas nuevas: `client_question_templates`, `client_questions`, `client_questionnaires` y `client_comms_templates`.
- **`lib/core/questions-rules.ts`**: reglas puras:
  - qué preguntas tocan a cada cliente y cuándo vuelven las periódicas;
  - canal de envío y plantillas con huecos;
  - limpieza de respuestas y de las propuestas de la IA.
- **`lib/core/questions.ts`**:
  - banco y textos de los correos;
  - puesta al día por cliente (`syncClientQuestions`) y la vista de la pestaña;
  - envío por correo o por cuestionario, y envío automático;
  - cuestionario público;
  - lectura de respuestas por correo con Haiku y destino de cada respuesta (ficha, memoria o módulo);
  - «Proponer con IA» con Sonnet y la pasada diaria.
- **`lib/core/questions-actions.ts`**: acciones con su permiso (cliente: `edit`; banco y textos: `admin`).
- **`lib/core/questionnaire-actions.ts`**: las dos acciones públicas del cuestionario, protegidas por el token.
- **`lib/core/capabilities.ts`**: `setClientServicesSource`, `registerClientQuestionSource` y `registerClientAnswerHandler`.
- **`lib/core/platform.ts`**: registra los trabajos `clientes.preguntas.leer`, `clientes.preguntas.auto` y `clientes.preguntas.diaria`.

**Operaciones:**
- **`lib/operaciones/agent-capabilities.ts`**: aporta los servicios de cada cliente.

**SEO:**
- **`lib/seo/preguntas/preguntas.ts`**:
  - ya no envía su propio correo: aporta los «datos que faltan» y recibe sus respuestas en el expediente;
  - si el cliente ya ha contestado un dato y está pendiente de confirmar, no se le vuelve a preguntar;
  - sigue leyendo los correos de preguntas anteriores.
- **`lib/seo/expediente-actions.ts`**: se quita `prepareQuestionsAction`.
- **Expediente** (`dossier-panel.tsx` y `page.tsx`): resumen y enlace a la ficha → Preguntas.

**Pantallas:**
- **`app/(dashboard)/dashboard/clientes/[id]/tab-preguntas.tsx`**: la pestaña Preguntas de la ficha, a la vista y con el número de pendientes.
- **`app/(dashboard)/dashboard/clientes/preguntas/`**: el Banco de preguntas.
- **`app/(dashboard)/dashboard/clientes/preguntas-ui.tsx`**: formulario de una pregunta y «Proponer con IA», comunes a las dos pantallas.
- **`app/cuestionario/[token]/`**: la página pública del cliente, por bloques y con guardado automático.
- **`components/clientes-tabs.tsx`** y **`components/app-shell/nav.ts`**: «Banco de preguntas» como pestaña y como entrada del menú, y su nombre en la miga.

**Mapa Visual:**
- **`lib/core/clients-process-map.ts`**: 6 pasos nuevos en el carril «Preguntas al cliente».
- **`lib/seo/salud/process-map.ts`**: paso `seo-preguntas` actualizado.
- `check-architecture-map` pasa.

**Pruebas:**
- **`tests/preguntas-cliente.test.ts`**: 20 pruebas, puras y contra la base de datos.
- **`tests/seguridad.test.ts`**: las 16 acciones nuevas.
- **`tests/auditoria.test.ts`**: las acciones públicas, con su motivo.
- **`tests/arquitectura-guardrails.test.ts`**: las 4 tablas nuevas del núcleo.
- Resultado: 665 pruebas pasan.

## Migraciones aplicadas
`lib/db/migrations/0064_preguntas_cliente.sql`. Aplicada en local tras la copia `backups/backup_pre_preguntas_20261125.sql`. Contiene:
- `CREATE TABLE` de `client_question_templates`, `client_questionnaires`, `client_questions` (con dos índices únicos parciales: una abierta por pregunta del banco y por dato) y `client_comms_templates`, con sus CHECK e índices;
- `INSERT` del banco inicial para cada cuenta: generales para todas, y las de SEO, Google Ads y Web solo donde existe ese servicio en `ops_services`;
- `INSERT` del proceso diario `clientes.preguntas.diaria` en `job_schedules`;
- `INSERT` de los prompts `clientes_leer_respuestas` y `clientes_proponer_preguntas` en `ai_prompts`.

El SQL completo está en el archivo.

## Decisiones técnicas tomadas en auto mode
- **Las preguntas viven en el núcleo, no en SEO.** Google Ads, Web y los demás departamentos las necesitan igual. Los módulos se conectan por el registro de capacidades, nunca importándose entre ellos.
- **El banco no incluye datos básicos** (teléfono, dirección, web). Los pide el módulo que los necesite y solo si le faltan, como dijo Enric.
- **Si un dato del expediente ya lo cubre una pregunta del banco, no se repite:** servicios → ficha «qué ofrece» y zona → ficha «zona».
- **Una respuesta nunca pisa la ficha.** Si el campo tenía contenido distinto, la pestaña ofrece «Usar esta respuesta».
- **Los borradores del cuestionario se entregan al pulsar «Enviar», al anularlo o al caducar.** Así no se aplica a la ficha cada pulsación de teclado.
- **Una pregunta de dato respondida no se reabre en 90 días.** Además, SEO no pregunta un dato que el cliente ya contestó y está pendiente de confirmar. Lo destapó una prueba: antes se le habría preguntado otra vez.
- **Sonnet para proponer preguntas:** es razonamiento de experto y se usa pocas veces. **Haiku para leer respuestas:** es extracción con cita.
- **Detalles de UX vistos en el navegador local:**
  - «Se guarda en» pasa de etiqueta a texto discreto;
  - barra fija para enviar cuando hay más de 5 preguntas;
  - «preparadas, esperando aprobación» separadas de «enviadas» (antes decía «enviado» sin haber salido);
  - preguntas ordenadas por bloque, con encabezados en el cuestionario;
  - miga «Banco de preguntas».

## Qué verificar manualmente
- **Clientes → Banco de preguntas:**
  - editar una pregunta, cambiar su orden y desactivarla;
  - «Proponer con IA» en Google Ads;
  - «Textos de los correos» → «Ver cómo queda».
- **Ficha de cm-iberica → Preguntas:**
  - aparecen General y SEO;
  - si nadie las recibe, marcar el contacto allí mismo;
  - «Preparar envío»: con más de 5 preguntas recomienda el cuestionario;
  - el correo queda esperando aprobación en la misma pestaña.
- **Al aprobarlo**, abrir el enlace del cuestionario desde el correo (por ejemplo, con un contacto propio), responder y pulsar «Enviar».
- **Después**, en la pestaña deben aparecer las respuestas con su destino: la ficha si estaba vacía y la memoria del cliente.

## Pendientes detectados
- Examen del prompt `clientes_leer_respuestas` con respuestas reales.
- Que los agentes preparen preguntas por Telegram.
- Mostrar en Para ti las respuestas distintas de la ficha.
- `seo_leer_respuestas` solo sirve para correos antiguos: se puede retirar más adelante.
