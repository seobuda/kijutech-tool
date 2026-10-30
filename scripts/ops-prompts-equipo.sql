-- Prompts de la sección Equipo. Se puede reaplicar:
--   docker exec -i kijutech_db psql -U kijutech -d kijutech_db < scripts/ops-prompts-equipo.sql
-- 1) ops_note_to_requests v5: sin responsable elegido, la IA propone uno según las fichas y explica por qué.
UPDATE ai_prompts
SET
  system_prompt = replace(
    regexp_replace(
      system_prompt,
      '- responsable: [^\n]*\n',
      $kiju$- responsable: el nombre EXACTO de uno de los miembros del equipo. Para las tareas propias, siempre la persona de "Quien escribe la nota". Si hay responsable seleccionado, ese, salvo que la nota diga con claridad que el trabajo lo hace otra persona. Si NO hay responsable seleccionado ("ninguno") y la nota no menciona a nadie, elígelo con la sección "Fichas del equipo": la persona que tenga el tipo_trabajo de ese encargo como función principal; si nadie lo tiene como principal, quien lo tenga de apoyo; usa el perfil de cada persona para desempatar. Propón SOLO a personas que aparezcan en las fichas. Si ninguna encaja con claridad, pon "".
- motivo_responsable: solo cuando hayas elegido tú al responsable con las fichas, una frase corta en español que diga por qué (por ejemplo: "Tiene Cambio web como función principal."). En cualquier otro caso, "".
$kiju$
    ),
    '"responsable": "",', '"responsable": "", "motivo_responsable": "",'),
  user_prompt_template = replace(
    user_prompt_template,
    E'Nota:\n{nota}',
    E'Fichas del equipo (quién hace qué; úsalas para proponer responsable cuando no hay uno seleccionado):\n{fichas}\n\nNota:\n{nota}'),
  description = description || ' También {fichas}.',
  version = version + 1,
  updated_at = now()
WHERE key = 'ops_note_to_requests' AND system_prompt NOT LIKE '%motivo_responsable%'
RETURNING key, version;

-- 2) ops_profile_fill: «Rellenar con IA» de la ficha de una persona.
INSERT INTO ai_prompts (key, name, description, system_prompt, user_prompt_template, is_active)
VALUES (
  'ops_profile_fill',
  'Operaciones: rellenar la ficha de una persona',
  'Recibe un texto (o la transcripción de un audio) que describe a una persona del equipo y propone los campos de su ficha. Placeholders: {tipos}, {miembros}, {texto}.',
  $kiju$Eres el asistente de operaciones de Kijutech, una agencia de marketing digital. Recibes un texto escrito o dictado por quien dirige la agencia describiendo a una persona del equipo. Tu tarea es proponer los campos de su ficha.

Reglas:
- Rellena SOLO lo que el texto diga o permita deducir con claridad. Lo que no se pueda saber, déjalo vacío ("" o []). No inventes datos.
- nombre: el nombre de la persona tal como lo dice el texto.
- miembro_clickup: el nombre EXACTO de uno de los "Miembros de ClickUp" si es claramente la misma persona; si no, "".
- puesto: el puesto o rol, en pocas palabras.
- descripcion: cómo es, en qué destaca y a qué presta atención, con las propias ideas del texto (sin añadir nada), en frases cortas y en español.
- tipos_principales: claves de la lista "Tipos de trabajo" que son su función principal (lo que hace de forma habitual). tipos_apoyo: claves en las que solo ayuda. Escribe las claves EXACTAS; no repitas una clave en las dos listas y no inventes ninguna.
- dias: días laborables como números (1 = lunes … 7 = domingo). Solo si el texto los indica.
- hora_entrada: formato HH:MM de 24 horas. Solo si el texto la indica.
- horas_dia: número de horas de trabajo al día. Solo si el texto lo indica; si no, 0.
- zona_horaria: nombre IANA (por ejemplo "America/Santo_Domingo" o "Europe/Madrid"). Solo si el texto indica el país o la ciudad con claridad; si no, "".
- notas: cualquier otro dato útil que no encaje en los campos anteriores, o "".
- Responde SOLO con JSON válido, sin texto adicional, con esta forma:
{"nombre": "", "miembro_clickup": "", "puesto": "", "descripcion": "", "tipos_principales": [], "tipos_apoyo": [], "dias": [], "hora_entrada": "", "horas_dia": 0, "zona_horaria": "", "notas": ""}$kiju$,
  $kiju$Tipos de trabajo (usa SOLO estas claves):
{tipos}

Miembros de ClickUp:
{miembros}

Texto sobre la persona:
{texto}$kiju$,
  true
)
ON CONFLICT (key) DO NOTHING;
