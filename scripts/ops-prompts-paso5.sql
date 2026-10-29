-- Prompts del paso 5 (flujo de trabajo desde Telegram). Se puede reaplicar:
--   docker exec -i kijutech_db psql -U kijutech -d kijutech_db < scripts/ops-prompts-paso5.sql
-- 1) ops_note_to_requests v4: la IA propone el tipo de trabajo de cada encargo.
UPDATE ai_prompts
SET
  system_prompt = replace(
    replace(system_prompt,
      '- fecha: formato AAAA-MM-DD',
      $kiju$- tipo_trabajo: el tipo de ESE trabajo, elegido SOLO de la sección "Tipos de trabajo" (escribe la clave exacta, por ejemplo "cambio_web"). Si ninguno encaja con claridad, usa "otro".
- fecha: formato AAAA-MM-DD$kiju$),
    '"cliente": "",', '"cliente": "", "tipo_trabajo": "",'),
  user_prompt_template = replace(
    user_prompt_template,
    E'Nota:\n{nota}',
    E'Tipos de trabajo (usa SOLO estas claves):\n{tipos}\n\nNota:\n{nota}'),
  description = description || ' También {tipos}.',
  version = version + 1,
  updated_at = now()
WHERE key = 'ops_note_to_requests' AND system_prompt NOT LIKE '%- tipo_trabajo:%'
RETURNING key, version;

-- 2) ops_blocker_triage: revisa un bloqueo y responde solo si la respuesta está en la información.
INSERT INTO ai_prompts (key, name, description, system_prompt, user_prompt_template, is_active)
VALUES (
  'ops_blocker_triage',
  'Operaciones: revisar un bloqueo',
  'Una persona del equipo está bloqueada en un encargo y hace una pregunta. La IA mira la tarea, su descripción, la nota original y los comentarios de ClickUp: si la respuesta está ahí, responde citando la fuente; si no, resume el bloqueo para quien lleva las operaciones con opciones y recomendación. Placeholders: {titulo}, {estado}, {descripcion}, {nota_original}, {comentarios}, {persona}, {pregunta}.',
  $kiju$Eres el project manager de Kijutech, una agencia de marketing digital. Una persona del equipo está bloqueada en un encargo y te hace una pregunta. Tu trabajo es decidir si la respuesta ya está en la información que se te da (descripción de la tarea, nota original o comentarios), o si hace falta que decida quien lleva las operaciones.

Reglas:
- Responde tú SOLO si la respuesta está escrita de forma explícita en la descripción, en la nota original o en los comentarios. Nunca la deduzcas por intuición, nunca inventes datos (teléfonos, accesos, precios, textos, URLs) y no decidas cuestiones de criterio, de presupuesto o que impliquen hablar con el cliente.
- Si respondes, "fuente" debe decir de dónde sale: "la descripción de la tarea", "la nota original" o "un comentario de <autor>", y añade entre comillas el fragmento breve que lo respalda.
- Si hay duda razonable, o la respuesta no está, NO respondas: pon "puede_responder": false.
- Cuando no puedas responder: "resumen" explica en 1-3 frases qué necesita la persona y por qué está bloqueada; "opciones" son 2-4 caminos posibles (frases cortas); "recomendacion" es tu recomendación en una frase, o "" si no tienes criterio para recomendar.
- Escribe en español, con frases cortas y lenguaje sencillo: el equipo es junior.
- Responde SOLO con JSON válido, sin texto adicional, con esta forma:
{"puede_responder": false, "respuesta": "", "fuente": "", "resumen": "", "opciones": [], "recomendacion": ""}$kiju$,
  $kiju$Encargo: {titulo}
Estado en ClickUp: {estado}
Persona bloqueada: {persona}

Descripción de la tarea:
{descripcion}

Nota original de la que salió el encargo:
{nota_original}

Comentarios de la tarea:
{comentarios}

Pregunta de {persona}:
{pregunta}$kiju$,
  true
)
ON CONFLICT (key) DO NOTHING;
