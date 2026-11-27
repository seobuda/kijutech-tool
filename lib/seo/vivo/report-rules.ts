// SEO · Informe mensual v1 (parte 12, 27 nov 2026; docs/DISENO-SEO-CIERRE.md §D). PURO: texto determinista desde los datos,
// sin IA (directiva de IA: una plantilla basta y no inventa). Se prueba en tests/seo-vivo.test.ts.
// Auditoría: «qué conseguimos» NO atribuye causas: solo da cifras, y lo medido por intervención con su veredicto honesto.

export type ReportInput = {
  clientName: string;
  monthLabel: string; // «noviembre de 2026»
  leads: { connected: boolean; month: number; prev: number; organic: number; topPages: { url: string; n: number }[] };
  gsc: { clicks: number | null; prevClicks: number | null; impressions: number | null };
  positions: { top3: number; top10: number; tracked: number } | null;
  ai: { share: number | null; answers: number } | null;
  work: { title: string; verdict: string | null }[];
  next: string[];
};

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const delta = (a: number | null, b: number | null) => {
  if (a == null || b == null) return '';
  const p = pct(a, b);
  return p == null ? '' : p === 0 ? ' (igual que el mes anterior)' : ` (${p > 0 ? '+' : ''}${p} % frente al mes anterior)`;
};
const VERDICT: Record<string, string> = { funciono: 'ha funcionado', no_funciono: 'no ha mejorado lo que buscaba', no_concluyente: 'aún sin datos suficientes para saberlo', pendiente: 'se medirá en las próximas semanas' };

export function monthlyReportText(r: ReportInput): { subject: string; body: string } {
  const L: string[] = [];
  L.push(`Hola,`, '', `Este es el resumen de ${r.monthLabel} del trabajo de posicionamiento de ${r.clientName}.`, '');
  L.push('QUÉ HA PASADO');
  if (r.leads.connected) {
    L.push(`- Contactos por los formularios de la web: ${r.leads.month}${delta(r.leads.month, r.leads.prev)}${r.leads.organic ? `, de ellos ${r.leads.organic} llegados desde Google (búsqueda orgánica)` : ''}.`);
    if (r.leads.topPages.length) L.push(`- Páginas que más contactos han traído: ${r.leads.topPages.slice(0, 3).map((p) => `${p.url} (${p.n})`).join(', ')}.`);
  }
  if (r.gsc.clicks != null) L.push(`- Visitas desde Google: ${r.gsc.clicks}${delta(r.gsc.clicks, r.gsc.prevClicks)}${r.gsc.impressions != null ? `; apareció ${r.gsc.impressions} veces en los resultados` : ''}.`);
  if (r.positions && r.positions.tracked) L.push(`- De las ${r.positions.tracked} búsquedas que seguimos, ${r.positions.top10} están en la primera página de Google y ${r.positions.top3} entre los tres primeros.`);
  if (r.ai && r.ai.share != null && r.ai.answers > 0) L.push(`- Asistentes de IA (ChatGPT, Gemini, Google y Perplexity): le mencionan o citan en el ${Math.round(r.ai.share * 100)} % de las respuestas que hemos revisado.`);
  if (L[L.length - 1] === 'QUÉ HA PASADO') L.push('- Aún no hay datos suficientes de este mes.');
  L.push('', 'QUÉ HEMOS HECHO');
  if (r.work.length) for (const w of r.work.slice(0, 10)) L.push(`- ${w.title}${w.verdict ? `: ${VERDICT[w.verdict] ?? w.verdict}` : ''}.`);
  else L.push('- Este mes nos hemos centrado en vigilar la web y preparar los siguientes trabajos.');
  if (r.next.length) {
    L.push('', 'QUÉ VIENE');
    for (const n of r.next.slice(0, 5)) L.push(`- ${n}.`);
  }
  L.push('', 'Las cifras de Google tienen unos días de retraso y varían de un mes a otro: miramos la tendencia, no un mes suelto. Cualquier duda, responde a este correo.', '', 'Un saludo,', 'El equipo de Kijutech');
  return { subject: `${r.clientName}: resumen SEO de ${r.monthLabel}`, body: L.join('\n') };
}
