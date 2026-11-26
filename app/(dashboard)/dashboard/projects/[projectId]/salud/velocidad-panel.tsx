// Proyecto → Salud técnica → Velocidad (26 nov 2026): la última medición, como en PageSpeed. Dos bloques:
//   - usuarios reales (Chrome UX Report, 28 días, móvil): LCP, INP y CLS por página;
//   - laboratorio (Lighthouse en los servidores de Google, móvil): nota 0-100 y métricas por página representativa,
// con los problemas que encontró y la evolución de la nota entre mediciones. Los umbrales son los públicos de Google.
import { Gauge } from 'lucide-react';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { SpeedRow, SpeedView } from '@/lib/seo/vigilancia/view';

type Level = 'good' | 'ni' | 'poor' | null;
const level = (v: number | null | undefined, good: number, ni: number): Level => (v == null ? null : v <= good ? 'good' : v <= ni ? 'ni' : 'poor');
const TONE: Record<Exclude<Level, null>, string> = { good: 'text-success', ni: 'text-warning-strong', poor: 'text-destructive' };
const secs = (ms: number | null | undefined) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s` : `${ms} ms`);
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
const path = (u: string) => {
  try {
    const x = new URL(u);
    return decodeURI(x.pathname) || '/';
  } catch {
    return u;
  }
};

function Metric({ label, value, lvl, hint }: { label: string; value: string; lvl: Level; hint: string }) {
  return (
    <div className="min-w-[88px]" title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${lvl ? TONE[lvl] : ''}`}>{value}</p>
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const lvl: Level = score == null ? null : score >= 90 ? 'good' : score >= 50 ? 'ni' : 'poor';
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative size-14 shrink-0 ${lvl ? TONE[lvl] : 'text-muted-foreground'}`} role="img" aria-label={`Nota de rendimiento: ${score ?? 'sin dato'} de 100`}>
      <svg viewBox="0 0 48 48" className="size-14 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
        <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">{score ?? '—'}</span>
    </div>
  );
}

const CATEGORY: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  FAST: { label: 'Rápida', tone: 'success' },
  AVERAGE: { label: 'Mejorable', tone: 'warning' },
  SLOW: { label: 'Lenta', tone: 'danger' }
};

function FieldRow({ r }: { r: SpeedRow }) {
  const cat = r.category ? CATEGORY[r.category] : null;
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={r.url}>
          {path(r.url)} {cat && <Badge tone={cat.tone}>{cat.label}</Badge>}
        </p>
        {r.scope === 'origin' && <p className="text-xs text-muted-foreground">Esta página no tiene tráfico suficiente: datos de toda la web.</p>}
      </div>
      <div className="flex flex-wrap gap-4">
        <Metric label="LCP" value={secs(r.lcpMs)} lvl={level(r.lcpMs, 2500, 4000)} hint="Lo que tarda en verse el elemento principal. Bien: ≤ 2,5 s" />
        <Metric label="INP" value={secs(r.inpMs)} lvl={level(r.inpMs, 200, 500)} hint="Lo que tarda en responder al tocar o hacer clic. Bien: ≤ 200 ms" />
        <Metric label="CLS" value={r.cls == null ? '—' : r.cls.toLocaleString('es-ES', { maximumFractionDigits: 2 })} lvl={level(r.cls, 0.1, 0.25)} hint="Cuánto salta el contenido al cargar. Bien: ≤ 0,1" />
      </div>
    </li>
  );
}

function LabRow({ r }: { r: SpeedRow }) {
  const d = r.data as { viewportOk?: boolean | null; insecureRequests?: number; unsizedImages?: number; imageSavingsKb?: number; totalKb?: number | null; imagesKnown?: boolean };
  const issues: string[] = [];
  if (d.viewportOk === false) issues.push('Sin adaptar al móvil');
  if ((d.insecureRequests ?? 0) > 0) issues.push(`${d.insecureRequests} recurso(s) sin HTTPS`);
  if (d.imagesKnown && (d.unsizedImages ?? 0) >= 3) issues.push(`${d.unsizedImages} imágenes sin tamaño`);
  if (d.imagesKnown && (d.imageSavingsKb ?? 0) >= 150) issues.push(`Imágenes: se pueden ahorrar ${d.imageSavingsKb} KB`);
  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <ScoreRing score={r.score} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={r.url}>
          {path(r.url)}
          {d.totalKb != null && <span className="ml-2 text-xs font-normal text-muted-foreground">{(d.totalKb / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB en total</span>}
        </p>
        <div className="mt-1 flex flex-wrap gap-4">
          <Metric label="Primer contenido" value={secs(r.fcpMs)} lvl={level(r.fcpMs, 1800, 3000)} hint="FCP. Bien: ≤ 1,8 s" />
          <Metric label="Mayor contenido" value={secs(r.lcpMs)} lvl={level(r.lcpMs, 2500, 4000)} hint="LCP. Bien: ≤ 2,5 s" />
          <Metric label="Bloqueo total" value={secs(r.tbtMs)} lvl={level(r.tbtMs, 200, 600)} hint="TBT: tiempo en que la página no responde. Bien: ≤ 200 ms" />
          <Metric label="CLS" value={r.cls == null ? '—' : r.cls.toLocaleString('es-ES', { maximumFractionDigits: 2 })} lvl={level(r.cls, 0.1, 0.25)} hint="Bien: ≤ 0,1" />
          <Metric label="Índice de velocidad" value={secs(r.siMs)} lvl={level(r.siMs, 3400, 5800)} hint="Speed Index. Bien: ≤ 3,4 s" />
        </div>
        {issues.length > 0 && <p className="mt-1 text-xs text-warning-strong">{issues.join(' · ')}</p>}
      </div>
    </li>
  );
}

function History({ history }: { history: NonNullable<SpeedView>['history'] }) {
  const pts = history.filter((h) => h.score != null);
  if (pts.length < 2) return null;
  const w = 160;
  const h = 32;
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p.score ?? 0) / 100) * h}`).join(' ');
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Evolución de la nota</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-brand" role="img" aria-label={`Nota de laboratorio en las últimas ${pts.length} mediciones: ${pts.map((p) => p.score).join(', ')}`}>
        <polyline points={xy} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span className="tabular-nums">
        {pts[0].score} → {pts[pts.length - 1].score}
      </span>
    </div>
  );
}

export function VelocidadPanel({ speed }: { speed: SpeedView }) {
  return (
    <Section
      title="Velocidad"
      description="Como en PageSpeed: lo que viven los usuarios reales de Chrome (últimos 28 días, móvil) y la prueba de laboratorio de Google (Lighthouse, móvil) en las páginas más visitadas. Verde: bien; ámbar: mejorable; rojo: mal."
      actions={speed ? <History history={speed.history} /> : undefined}
    >
      {!speed ? (
        <EmptyState icon={Gauge} title="Aún no hay mediciones" description="Se mide sola cada mes. Para verla ya, pulsa «Comprobar ahora» en «Velocidad real de los usuarios» (Vigilancia automática): tarda de 2 a 5 minutos." />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Última medición: {fmt(speed.measuredAt)}</p>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usuarios reales (Core Web Vitals)</h3>
            {speed.field.length ? (
              <ul className="divide-y rounded-lg border">
                {speed.field.map((r) => (
                  <FieldRow key={r.url} r={r} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Google aún no tiene datos reales de esta web: hace falta más tráfico de Chrome. El laboratorio de abajo sí vale.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Laboratorio (Lighthouse, móvil)</h3>
            {speed.lab.length ? (
              <ul className="divide-y rounded-lg border">
                {speed.lab.map((r) => (
                  <LabRow key={r.url} r={r} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">La prueba de laboratorio no pudo hacerse en esta medición (Google no pudo cargar las páginas o limitó las peticiones).</p>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
