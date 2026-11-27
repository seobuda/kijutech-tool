'use client';

// Proyecto → Plan → Resultados (SEO parte 8, 27 nov 2026): ¿funcionó cada encargo hecho? Resumen por técnica (tendencia,
// no aprendizaje, hasta tener muchas) y el detalle plegable de cada intervención con su veredicto y sus números.
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Section } from '@/components/ui/page';

export type ResultView = {
  id: string;
  technique: string;
  techniqueLabel: string;
  urls: string[];
  status: string;
  doneAt: string | null;
  verdict: string | null;
  effectPct: number | null;
  metric: string | null;
  reasons: string[];
  effectiveSource: string | null;
  done: string | null;
  incrementalClicks: number | null;
  days: number | null;
};

const VERDICT: Record<string, { label: string; tone: 'success' | 'danger' | 'neutral' | 'outline' | 'info' }> = {
  funciono: { label: 'Funcionó', tone: 'success' },
  no_funciono: { label: 'No funcionó', tone: 'danger' },
  no_concluyente: { label: 'No concluyente', tone: 'neutral' },
  no_medible: { label: 'No medible con Search Console', tone: 'outline' },
  sin_datos: { label: 'Sin datos', tone: 'outline' }
};
const METRIC: Record<string, string> = { clics: 'clics', impresiones: 'impresiones', posicion: 'posición', ctr: 'CTR' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { dateStyle: 'medium' }) : '—');
const path = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

export type TrendView = { technique: string; label: string; metric: string; n: number; clients: number; funciono: number; effectPct: number | null; lowPct: number | null; highPct: number | null; tag: string };

export function ResultadosPanel({ results, trends = [] }: { results: ResultView[]; trends?: TrendView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const byTech = new Map<string, ResultView[]>();
  for (const r of results) byTech.set(r.technique, [...(byTech.get(r.technique) ?? []), r]);
  const measured = results.filter((r) => r.verdict && r.verdict !== 'no_medible');
  const pending = results.filter((r) => r.status === 'hecha' && !r.verdict);

  return (
    <Section
      title="Resultados"
      description="Lo que pasó después de cada encargo hecho: comparamos sus páginas en Search Console antes y después del cambio (fecha real, del registro de cambios) con el resto de la web. «No concluyente» es frecuente y honesto: pocos datos o mucho ruido. Por técnica es una tendencia, no una regla, hasta tener muchos casos."
    >
      <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Encargos hechos</dt>
          <dd className="text-lg font-semibold">{results.filter((r) => r.status === 'hecha').length}</dd>
        </div>
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Medidos</dt>
          <dd className="text-lg font-semibold">
            {measured.length} <span className="text-sm font-normal text-muted-foreground">({measured.filter((r) => r.verdict === 'funciono').length} funcionaron)</span>
          </dd>
        </div>
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Esperando datos</dt>
          <dd className="text-lg font-semibold">{pending.length}</dd>
        </div>
      </dl>
      {results.length ? (
        <div className="flex flex-col gap-2">
          {[...byTech].map(([tech, list]) => {
            const isOpen = open === tech;
            const ok = list.filter((r) => r.verdict === 'funciono').length;
            const bad = list.filter((r) => r.verdict === 'no_funciono').length;
            const nc = list.filter((r) => r.verdict === 'no_concluyente').length;
            return (
              <div key={tech} className="rounded-md border">
                <button type="button" className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : tech)}>
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <span className="font-medium">{list[0].techniqueLabel}</span>
                  <span className="text-muted-foreground">
                    {list.length} encargo{list.length === 1 ? '' : 's'}
                    {ok + bad + nc ? ` · ${ok} funcionó · ${bad} no · ${nc} no concluyente` : ''}
                  </span>
                </button>
                {isOpen && (
                  <ul className="divide-y border-t text-sm">
                    {list.map((r) => {
                      const v = r.verdict ? VERDICT[r.verdict] : null;
                      return (
                        <li key={r.id} className="flex flex-col gap-1 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {v ? <Badge tone={v.tone}>{v.label}</Badge> : <Badge tone="outline">{r.status === 'hecha' ? 'Esperando datos' : 'En curso'}</Badge>}
                            {r.effectPct != null && r.verdict !== 'no_medible' && (
                              <span className="font-medium">
                                {r.effectPct > 0 ? '+' : ''}
                                {r.effectPct} % en {METRIC[r.metric ?? ''] ?? r.metric} frente al resto de la web
                                {r.days ? ` (${r.days} días)` : ''}
                              </span>
                            )}
                            {r.incrementalClicks != null && r.incrementalClicks !== 0 && <span className="text-muted-foreground">≈ {r.incrementalClicks > 0 ? '+' : ''}{r.incrementalClicks} clics en el periodo</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Hecho: {fmt(r.doneAt)}
                            {r.effectiveSource ? ` · fecha real: ${r.effectiveSource.startsWith('registro') ? 'registro de cambios' : 'la del encargo'}` : ''}
                            {r.done === 'no_hecho' ? ' · ¡no consta el cambio en la web!' : ''}
                            {r.urls.length ? ` · ${r.urls.slice(0, 3).map(path).join(', ')}${r.urls.length > 3 ? ` y ${r.urls.length - 3} más` : ''}` : ''}
                          </p>
                          {r.reasons.length > 0 && <p className="text-xs text-muted-foreground">Motivo: {r.reasons.join('; ')}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay encargos aprobados desde el plan. Cuando se hagan, aquí verás si funcionaron (a partir de 4 semanas).</p>
      )}
      <details className="mt-4 rounded-md border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Tendencias por técnica en todos los clientes ({trends.length})</summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Efecto medio de cada técnica en los clientes de la agencia (cada cliente cuenta una vez; con su intervalo). «Pocos casos» o «tendencia» no son reglas: con 50 casos y 10 clientes pasa a «aprendizaje» y entonces ordena el plan. Ojo: solo se mide lo que se hace, y donde se hace.
        </p>
        {trends.length ? (
          <ul className="mt-2 divide-y">
            {trends.map((t) => (
              <li key={`${t.technique}-${t.metric}`} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="font-medium">{t.label}</span>
                <Badge tone={t.tag === 'aprendizaje' ? 'success' : t.tag === 'tendencia' ? 'info' : 'outline'}>{t.tag}</Badge>
                <span className="text-muted-foreground">
                  {t.n} caso{t.n === 1 ? '' : 's'} en {t.clients} cliente{t.clients === 1 ? '' : 's'} · {t.funciono} funcionaron
                  {t.effectPct != null ? ` · ${t.effectPct > 0 ? '+' : ''}${t.effectPct} % en ${METRIC[t.metric] ?? t.metric} (de ${t.lowPct} a ${t.highPct} %)` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted-foreground">Aún no hay intervenciones medidas.</p>
        )}
      </details>
    </Section>
  );
}
