# SEO Hito 2: correo de 3 preguntas al cliente
**Fecha:** 2026-11-24  
**Rama:** feature/seo-3-preguntas  
**Commit:** 33b6df62

## Qué se construyó
- **`lib/seo/preguntas/rules.ts`** (nuevo, reglas puras):
  - `questionCandidates` y `pickQuestions`: buscan lo que falta, lo que tiene conflicto o es dudoso, y ordenan por peso.
  - `questionsEmail`: rellena la plantilla del correo.
  - `questionsDedupeKey` y `fieldsFromDedupeKey`: guardan en la clave del mensaje qué campos se preguntaron.
  - `stripQuotedReply`: quita nuestro correo citado de la respuesta.
  - `cleanAnswers`: acepta un dato solo si la cita está en el texto y el valor tiene la forma del campo.
  - `ruleAnswers`: plan B sin IA, que solo saca un teléfono.
- **`lib/seo/preguntas/preguntas.ts`** (nuevo):
  - `questionsState` da el estado para la pantalla.
  - `prepareQuestions` crea el correo con `createClientMessage` del núcleo, tipo «preguntas».
  - `maybeAutoQuestions` lo prepara solo al reunir el expediente.
  - `readAnswers` lee la respuesta con Haiku y guarda los datos como origen «cliente», provisionales, con aviso a Enric por Telegram.
  - Trabajos `seo.preguntas.preparar` y `seo.preguntas.leer`, más el oyente de respuestas `seo.preguntas`.
- **`lib/seo/expediente/rules.ts`**: nuevo origen `cliente` (confianza base 90) y campos `servicios` y `zona`.
- **`lib/seo/expediente/collect.ts`**:
  - los servicios salen de «Qué vende u ofrece»;
  - lo que viene de `persona` y `cliente` cuenta para la confianza y nunca se borra;
  - al terminar, se intenta preparar el correo de preguntas.
- **`lib/seo/expediente-actions.ts`**:
  - nueva acción `prepareQuestionsAction` (permiso `edit`);
  - se pueden escribir a mano los servicios y la zona;
  - «Pasar a la ficha» para los servicios escribe en «Qué vende u ofrece».
- **`app/(dashboard)/dashboard/projects/[projectId]/expediente/`**:
  - sección «Preguntas al cliente», con lo que se preguntaría, el último correo y el botón «Preparar el correo»;
  - los datos con origen «Respuesta del cliente» muestran su cita.
- **`lib/core/comms.ts`**: `repliedClientMessage` devuelve el mensaje nuestro al que responde un correo.
- **`lib/operaciones/email-pm.ts`**: `threadContext` añade al hilo del agente del correo nuestro mensaje original. Vale para cualquier tipo de comunicación. Si el mensaje es de preguntas, añade además una nota: las respuestas ya se guardan solas, así que basta con agradecer.
- **`lib/seo/register.ts`**: registro de los trabajos.
- **Mapa Visual**: paso `seo-preguntas` en `lib/seo/salud/process-map.ts`.
- **`docs/ESTADO.md`**: §6.39.
- **Pruebas**: `tests/seo-preguntas.test.ts` (11) y `tests/seguridad.test.ts` (nueva acción).

## Migraciones aplicadas
`0063_seo_preguntas_prompt.sql`, aprobada por Enric el 24 nov. Solo datos: inserta el prompt, sin cambios de esquema.

```sql
INSERT INTO "ai_prompts" ("key", "name", "description", "system_prompt", "user_prompt_template", "is_active")
VALUES ('seo_leer_respuestas', 'SEO: leer la respuesta del cliente a las preguntas', '…', $prompt$…$prompt$, $tpl$…$tpl$, true)
ON CONFLICT ("key") DO NOTHING;
```

El texto completo está en `lib/db/migrations/0063_seo_preguntas_prompt.sql`.

## Decisiones técnicas tomadas en auto mode
- **Correo desde el buzón del agente.** Se usan las comunicaciones del núcleo: el envío lo hace Operaciones con Resend desde agente@…. Así la respuesta vuelve al mismo buzón. Enric lo pidió expresamente: que el agente reciba la respuesta y sepa de qué va.
- **Hueco que se ha cerrado.** El agente del correo no veía los mensajes que habíamos iniciado nosotros. Ahora el hilo empieza por nuestro mensaje original, y esto mejora también las respuestas a informes y avisos.
- **Campos preguntados en la clave del mensaje.** `client_messages` no tiene una columna de metadatos y no se quería tocar el esquema.
- **Respuesta sin nuestro correo citado.** Se lee solo lo que escribió el cliente. Si no, las opciones que le dimos en el correo pasarían por respuestas.
- **Campos nuevos `servicios` y `zona` en el expediente.** El diseño pedía poder preguntar por ellos.
- **Plazo entre correos.** El de 30 días cuenta también si Enric descartó el correo, para no insistirle.
- **Prompt por migración.** Se sigue la convención del proyecto (prompts editables en IA → Prompts); de ahí la 0063.

## Qué verificar manualmente
- Para que el correo pueda salir, en la ficha de CM Ibérica → Contactos un contacto con correo tiene que tener marcado «Preguntas».
- Proyectos → CM Ibérica → Expediente → «Preguntas al cliente»: comprobar qué preguntaría y pulsar «Preparar el correo». Debe llegar a Telegram para aprobarlo.
- Cuando conteste el cliente:
  - Telegram avisa con los datos para confirmar;
  - el Expediente los muestra como «Respuesta del cliente», con la cita;
  - el agente propone un agradecimiento que menciona las preguntas.
- Prueba real del prompt con una respuesta de verdad. No se ha llamado a Haiku en local.

## Pendientes detectados
- El prompt `seo_leer_respuestas` no tiene examen (`registerPromptEvalSuite`). Convendría crearlo con 4 o 5 respuestas tipo.
- Al cambiar el tipo de dato de `servicios` en la ficha, convendría que el expediente se recogiera de nuevo solo.
