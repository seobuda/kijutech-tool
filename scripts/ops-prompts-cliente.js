// Genera scripts/ops-prompts-cliente.sql (prompts v3 de ops_note_to_requests y v2 de ops_prepare_request
// con el campo Cliente) a partir de la v2 de la nota. Uso: node scripts/ops-prompts-cliente.js
const fs = require('fs');
let v2 = fs.readFileSync(__dirname + '/ops-note-to-requests-prompt-v2.sql', 'utf8');
const rep = (a, b) => {
  if (!v2.includes(a)) throw new Error('no encontrado: ' + a.slice(0, 50));
  v2 = v2.replace(a, () => b);
};
rep(
  '- fecha: formato AAAA-MM-DD',
  '- cliente: el cliente de ESE trabajo, elegido SOLO de las "Opciones válidas" de la sección "Clientes" que valen para la lista que elijas. Copia el texto de la opción EXACTAMENTE como aparece. Deduce el cliente de lo que dice la nota (nombre del negocio, dominio o web mencionados). Si la nota no permite saber con claridad cuál es, o la lista no tiene campo Cliente, pon "" (cadena vacía). Nunca inventes un cliente ni elijas el más parecido por adivinar.\n- fecha: formato AAAA-MM-DD'
);
rep('"responsable": "", "fecha": "",', '"responsable": "", "cliente": "", "fecha": "",');
rep('Miembros del equipo:\n{miembros}', 'Miembros del equipo:\n{miembros}\n\nClientes (campo "Cliente" de ClickUp; usa SOLO estas opciones):\n{clientes}');
rep('{yo}, {listas}, {miembros}, {nota}', '{yo}, {listas}, {miembros}, {clientes}, {nota}');
rep('Prompt ops_note_to_requests v2 (tareas propias siempre a quien lleva las operaciones)', 'Prompt ops_note_to_requests v3 (añade el campo Cliente de ClickUp)');
v2 = v2.replace('prompt-v2.sql', 'prompts-cliente.sql');

const prepare = `
-- Prompt ops_prepare_request v2 (añade el campo Cliente de ClickUp)
UPDATE ai_prompts
SET
  system_prompt = replace(
    replace(system_prompt,
      '- Escribe en español, con frases cortas',
      E'- cliente: el cliente de este encargo, elegido SOLO de las opciones de la sección "Clientes" y copiado EXACTAMENTE. Deduce el cliente de lo que dice la petición (nombre del negocio, dominio o web mencionados). Si no se puede saber con claridad, o la lista no tiene campo Cliente, pon "" (cadena vacía). Nunca inventes un cliente.\\n- Escribe en español, con frases cortas'),
    '"datos_que_faltan": []}', '"datos_que_faltan": [], "cliente": ""}'),
  user_prompt_template = replace(user_prompt_template, E'Petición:\\n{peticion}', E'Clientes (campo "Cliente" de ClickUp de esa lista; usa SOLO estas opciones):\\n{clientes}\\nPetición:\\n{peticion}'),
  description = description || ' También {clientes}.',
  version = version + 1,
  updated_at = now()
WHERE key = 'ops_prepare_request' AND system_prompt NOT LIKE '%- cliente:%'
RETURNING key, version;
`;
fs.writeFileSync(__dirname + '/ops-prompts-cliente.sql', v2 + prepare);
console.log('ok');
