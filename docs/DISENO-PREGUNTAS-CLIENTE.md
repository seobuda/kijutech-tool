# Preguntas al cliente: diseño

**Fecha:** 25 nov 2026. **Aprobado por Enric** («adelante con las 3 partes; el banco lo redactas tú»). Migración **0064**.

## Problema
Antes había un correo de 3 preguntas generado desde el expediente SEO:
- las preguntas y el texto estaban en el código: para cambiar una palabra había que pedírselo a Claude;
- solo preguntaba datos básicos (teléfono, dirección…), que en un cliente ya captado normalmente se tienen;
- no servía para Google Ads ni para otros departamentos;
- el botón estaba escondido en el Expediente, y había que ir a Contactos para marcar quién recibía las preguntas.

## Objetivo
Un único sitio para todo lo que se le pregunta a un cliente:
- las preguntas salen solas de los servicios que le hacemos;
- se editan sin tocar código;
- se envían por el canal que toque y las respuestas acaban donde sirven: en la ficha, en la memoria (la leen los agentes) o en el módulo que las pidió.

## Alternativas descartadas
| Alternativa | Por qué no |
|---|---|
| Hacer editables solo los textos del correo actual | No resuelve las preguntas por servicio ni sirve para Ads. |
| Google Forms o Typeform | Las respuestas se quedarían fuera de la herramienta y los agentes no las verían. No se pueden quitar las preguntas ya respondidas ni volver a preguntar las periódicas. |
| Que la IA invente las preguntas cada vez, sin banco | No se controla qué se pregunta y cada cliente recibiría algo distinto. La IA sirve para **proponer** preguntas que una persona acepta. |

## Diseño (núcleo, común a todos los departamentos)
**1. Banco** (`client_question_templates`), en Clientes → Banco de preguntas:
- un grupo por servicio de `ops_services` (General = todos);
- cada pregunta lleva su texto, para qué se pregunta, el tipo de respuesta, el destino (`memoria[.tipo]` o `ficha.<campo>`) y cuándo se pregunta: una vez al empezar, o cada N días;
- banco inicial redactado como lo haría un experto: 11 generales, 10 de SEO, 12 de Google Ads y 6 de Web. Los datos básicos no van en el banco: los pregunta el módulo que los necesite, solo si le faltan.

**2. Textos de los correos** (`client_comms_templates`):
- asunto y cuerpo con huecos `{cliente}`, `{preguntas}`, `{n}`, `{servicios}`, `{enlace}` y `{caduca}`;
- sin fila guardada se usa el texto por defecto del código.

**3. Preguntas de cada cliente** (`client_questions`), en la pestaña «Preguntas» de la ficha, a la vista y con el número de pendientes.
- Se ponen al día solas con `syncClientQuestions`:
  - se abren las del banco de General y de sus servicios; Operaciones dice qué servicios tiene cada cliente (`setClientServicesSource`);
  - las periódicas vuelven cuando pasa su plazo;
  - las de un servicio que se le quita se cierran;
  - un correo descartado devuelve sus preguntas a pendiente.
- Los módulos aportan «datos que faltan» (`registerClientQuestionSource`). SEO aporta los huecos del expediente:
  - si el banco ya cubre el mismo dato (servicios → ficha.offerings, zona → ficha.area), no se repite;
  - un dato respondido no se vuelve a abrir en 90 días.
- Por cliente se puede: «Ya lo sé» (responder a mano), editar el texto solo para él, «No aplica», añadir una pregunta suelta y «Proponer con IA».

**4. Envío** por las comunicaciones del núcleo (destinatarios «Preguntas» y la política de aprobación de siempre):
- con 5 preguntas o menos, correo corto; con más, cuestionario en línea (`client_questionnaires`);
- el cuestionario es una página pública `/cuestionario/<token>`: el token son 24 bytes aleatorios y en la base de datos solo se guarda su hash. Caduca a los 30 días y tiene guardado automático;
- envío automático cuando lo pide un módulo (SEO al reunir el expediente): como mucho uno cada 30 días.

**5. Respuestas**:
- **Por correo:** Haiku (`clientes_leer_respuestas`) extrae cada respuesta con su cita literal, y el código descarta lo que no esté en lo que escribió el cliente.
- **Por cuestionario:** las respuestas llegan ya ordenadas.
- **Destino:**
  - un campo de la ficha, solo si estaba vacío; si no, la pestaña ofrece «Usar esta respuesta»;
  - la memoria del cliente;
  - o el manejador del módulo (`registerClientAnswerHandler`; SEO las guarda en el expediente como provisionales).

**6. IA para proponer** (`clientes_proponer_preguntas`, Sonnet):
- desde el banco o desde un cliente concreto, con su ficha como contexto;
- no guarda nada: una persona elige qué preguntas se añaden.

## UX: por qué así
- **Un solo sitio por cliente**: una pestaña visible, no escondida en «Ficha y ajustes».
- **Lo que bloquea se arregla allí mismo**:
  - si nadie recibe las preguntas, se marca el contacto desde la propia pestaña;
  - el correo que espera aprobación se aprueba, se corrige o se descarta sin salir.
- **El banco está en el espacio Clientes** (pestaña y menú), con enlace desde cada ficha. Se edita en línea, sin ventanas emergentes.
- **El cliente ve una página simple**:
  - bloques con encabezados («Sobre vuestro negocio», «SEO»…) y una explicación de para qué sirve cada pregunta;
  - guardado automático y un único botón para enviar.

## Pendiente
- Examen (eval) del prompt `clientes_leer_respuestas` con respuestas reales.
- Que los agentes puedan preparar preguntas desde Telegram («pregúntale a X lo de Ads»).
- Mostrar en «Para ti» las respuestas que dicen algo distinto de la ficha.
