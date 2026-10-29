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
