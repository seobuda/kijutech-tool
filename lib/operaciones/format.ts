// Utilidades compartidas por "Preparar con IA" (encargo suelto) y "Convertir
// nota en encargos": mismo formato de descripción en ambos casos.

export type PreparedFields = {
  resultado_esperado: string;
  pasos: string[];
  criterios_aceptacion: string[];
  datos_que_faltan: string[];
};

export function fillTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

export function buildDescription(p: PreparedFields): string {
  const parts: string[] = [];
  if (p.resultado_esperado.trim()) parts.push(`## Resultado esperado\n${p.resultado_esperado.trim()}`);
  if (p.pasos.length) parts.push(`## Pasos\n${p.pasos.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  if (p.criterios_aceptacion.length)
    parts.push(`## Criterios de aceptación\n${p.criterios_aceptacion.map((c) => `- [ ] ${c}`).join('\n')}`);
  if (p.datos_que_faltan.length)
    parts.push(`## Datos que faltan\n${p.datos_que_faltan.map((q) => `- ${q}`).join('\n')}`);
  return parts.join('\n\n');
}

// Tareas PROPIAS de quien lleva las operaciones (Enric): llamar o escribir al
// cliente, decidir, aprobar, pedir datos… Van siempre a él, aunque en el Bloc
// haya otra persona seleccionada como responsable. El prompt ya se lo pide a la
// IA; esto es la red de seguridad por si el modelo no lo cumple.
const OWN_TASK_STARTS =
  /^(llamar|telefonear|decidir|aprobar|autorizar|validar|reunirse|quedar|dar el visto bueno)\b/i;
const CLIENT_CONTACT =
  /^(escribir|enviar|mandar|pedir|solicitar|preguntar|consultar|confirmar|avisar|informar|contactar|recordar|responder|comunicar|reclamar)\b.*\b(al|a la|con el|con la|del|de la|a los|a las)\s+(clientes?|clientas?)\b/i;

export function isOwnTask(title: string): boolean {
  const t = title.trim();
  return OWN_TASK_STARTS.test(t) || CLIENT_CONTACT.test(t);
}
