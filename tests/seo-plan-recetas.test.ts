// Cada técnica a la que apunta un tipo de hallazgo tiene receta en el plan (si no, el plan fallaría al agrupar).
import { describe, expect, it } from 'vitest';
import { buildPlan, KIND_TECHNIQUE } from '@/lib/seo/plan/rules';

describe('recetas del plan', () => {
  it('ninguna técnica sin receta', () => {
    for (const [kind, tech] of Object.entries(KIND_TECHNIQUE)) {
      const drafts = buildPlan([{ id: `f-${kind}`, kind, severity: 'aviso', url: 'https://w.es/x', query: null, value: null, evidence: {} }] as never, new Map(), null);
      expect(drafts.length, `${kind} → ${tech}`).toBeGreaterThan(0);
    }
  });
});
