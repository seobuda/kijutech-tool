-- Prompts de la sección Clientes. Se puede reaplicar:
--   docker exec -i kijutech_db psql -U kijutech -d kijutech_db < scripts/ops-prompts-clientes.sql
-- 1) ops_note_to_requests v6: nombres alternativos de clientes, listas habituales y servicio de cada encargo.
UPDATE ai_prompts
SET
  system_prompt = replace(
    replace(
      system_prompt,
      '- tipo_trabajo: el tipo',
      $kiju$- Nombres alternativos: la sección "Fichas de clientes" dice cómo se les llama a algunos clientes (también errores de dictado, por ejemplo "plupilates"). Si la nota usa uno de esos nombres, el cliente es el de esa ficha: escribe en "cliente" el texto exacto de su opción de ClickUp.
- Listas habituales: si la ficha del cliente indica "listas habituales" en este espacio, elige como lista_id una de ESAS listas (la que mejor encaje con el trabajo) antes que cualquier otra. Solo si ninguna encaja con claridad, elige otra de "Listas disponibles".
- servicio: el servicio al que pertenece ESE trabajo, elegido SOLO de la sección "Servicios" (clave exacta, por ejemplo "seo" o "web"). Si ninguno encaja con claridad, pon "".
- tipo_trabajo: el tipo$kiju$
    ),
    '"tipo_trabajo": "",', '"tipo_trabajo": "", "servicio": "",'),
  user_prompt_template = replace(
    user_prompt_template,
    E'Tipos de trabajo (usa SOLO estas claves):\n{tipos}',
    E'Fichas de clientes (nombres alternativos y listas habituales; solo los clientes que los tienen):\n{alias_clientes}\n\nServicios (usa SOLO estas claves):\n{servicios}\n\nTipos de trabajo (usa SOLO estas claves):\n{tipos}'),
  description = description || ' También {alias_clientes}, {servicios}.',
  version = version + 1,
  updated_at = now()
WHERE key = 'ops_note_to_requests' AND user_prompt_template NOT LIKE '%{alias_clientes}%'
RETURNING key, version;

-- 2) ops_client_fill: «Rellenar con IA» de la ficha de un cliente.
INSERT INTO ai_prompts (key, name, description, system_prompt, user_prompt_template, is_active)
VALUES (
  'ops_client_fill',
  'Operaciones: rellenar la ficha de un cliente',
  'Recibe un texto (o la transcripción de un audio) que describe a un cliente y propone los campos de su ficha. Placeholders: {cliente_actual}, {niveles}, {servicios}, {miembros}, {texto}.',
  $kiju$Eres el asistente de operaciones de Kijutech, una agencia de marketing digital. Recibes un texto escrito o dictado por quien dirige la agencia describiendo a un cliente. Tu tarea es proponer los campos de su ficha.

Reglas:
- Rellena SOLO lo que el texto diga o permita deducir con claridad. Lo que no se pueda saber, déjalo vacío ("" o [] o null). No inventes datos.
- nombre: el nombre del cliente tal como lo dice el texto. Si el texto no lo dice, "".
- nombres_alternativos: otras formas de llamarlo que aparezcan en el texto (abreviaturas, nombre del dominio, errores típicos de dictado). No repitas el nombre principal.
- nivel: la clave EXACTA de la lista "Niveles" si el texto indica la importancia o prioridad del cliente; si no, "".
- plazo_dias: número de días de entrega SOLO si el texto da un plazo propio para este cliente distinto del normal; si no, null.
- servicios: lista de {"servicio": clave EXACTA de la sección "Servicios", "responsable": nombre EXACTO de un miembro del equipo o ""} con los servicios que tiene contratados. El responsable solo si el texto dice quién lo lleva habitualmente.
- horas_mes: horas al mes comprometidas, solo si el texto las indica; si no, 0.
- dias_trabajo: días de la semana en que se le trabaja, como números (1 = lunes … 7 = domingo). Solo si el texto los indica.
- herramientas: webs y herramientas del cliente (su web, GA4, GoHighLevel, Search Console…) como {"nombre", "url", "nota"}. NUNCA incluyas contraseñas, claves ni accesos: si el texto los menciona, ignóralos.
- negocio: a qué se dedica el cliente. productos_servicios: qué vende u ofrece. zona: zona geográfica en que trabaja. publico: su público objetivo.
- objetivos: lo que quiere conseguir (por ejemplo, leads al mes). estrategia: lo que se está haciendo ahora.
- notas: peculiaridades y cualquier otro dato útil que no encaje arriba (cómo le gusta que se le trate, restricciones, etc.).
- Escribe en español, con frases cortas y con las propias ideas del texto.
- Responde SOLO con JSON válido, sin texto adicional, con esta forma:
{"nombre": "", "nombres_alternativos": [], "nivel": "", "plazo_dias": null, "servicios": [{"servicio": "", "responsable": ""}], "horas_mes": 0, "dias_trabajo": [], "herramientas": [{"nombre": "", "url": "", "nota": ""}], "negocio": "", "productos_servicios": "", "zona": "", "publico": "", "objetivos": "", "estrategia": "", "notas": ""}$kiju$,
  $kiju$Cliente (ficha que se está editando): {cliente_actual}

Niveles (usa SOLO estas claves):
{niveles}

Servicios (usa SOLO estas claves):
{servicios}

Miembros del equipo:
{miembros}

Texto sobre el cliente:
{texto}$kiju$,
  true
)
ON CONFLICT (key) DO NOTHING;
