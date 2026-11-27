// SEO parte 12 · panel en vivo e informe mensual (27 nov 2026; docs/DISENO-SEO-CIERRE.md §D con la auditoría Opus).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monthlyReportText } from '@/lib/seo/vivo/report-rules';

const base = {
  clientName: 'Taller Rius',
  monthLabel: 'noviembre de 2026',
  leads: { connected: true, month: 12, prev: 10, organic: 7, topPages: [{ url: 'tallerrius.com/itv', n: 5 }] },
  gsc: { clicks: 400, prevClicks: 500, impressions: 9000 },
  positions: { top3: 4, top10: 9, tracked: 20 },
  ai: { share: 0.25, answers: 40 },
  work: [{ title: 'Página de demanda', verdict: 'funciono' }, { title: 'Enlazado interno', verdict: null }],
  next: ['Reescribir títulos']
};

describe('informe mensual: texto determinista', () => {
  it('cifras con su comparación y sin atribuir causas', () => {
    const r = monthlyReportText(base);
    expect(r.subject).toBe('Taller Rius: resumen SEO de noviembre de 2026');
    expect(r.body).toContain('Contactos por formularios (web y anuncios): 12 (+20 % frente al mes anterior), de ellos 7 llegados desde Google');
    expect(r.body).toContain('Visitas desde Google: 400 (-20 % frente al mes anterior)');
    expect(r.body).toContain('9 están en la primera página');
    expect(r.body).toContain('en el 25 % de las respuestas');
    expect(r.body).toContain('Página de demanda: ha funcionado');
    expect(r.body).toContain('QUÉ VIENE');
    expect(r.body).not.toMatch(/gracias a|debido a nuestro/i);
  });
  it('sin GoHighLevel ni datos, no inventa', () => {
    const r = monthlyReportText({ ...base, leads: { connected: false, month: 0, prev: 0, organic: 0, topPages: [] }, gsc: { clicks: null, prevClicks: null, impressions: null }, positions: null, ai: null, work: [], next: [] });
    expect(r.body).not.toContain('Contactos');
    expect(r.body).toContain('Aún no hay datos suficientes de este mes');
    expect(r.body).toContain('nos hemos centrado en vigilar');
    expect(r.body).not.toContain('QUÉ VIENE');
  });
});

describe('informe mensual: nunca sale solo (auditoría, grave 1)', () => {
  it('el borrador va siempre con aprobación forzada y una vez por proyecto y mes', () => {
    const src = readFileSync('lib/seo/vivo/vivo.ts', 'utf8');
    const call = src.slice(src.indexOf('createClientMessage({'), src.indexOf('});', src.indexOf('createClientMessage({')));
    expect(call).toContain('forceApproval: true');
    expect(call).toMatch(/dedupeKey: `informe:\$\{projectId\}:/);
  });
});
