import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth/permissions';
import { Button } from '@/components/ui/button';
import { listClients } from '@/lib/operaciones/clients';
import { getMonthWork, monthRange } from '@/lib/operaciones/client-activity';
import { htmlToPlain } from '@/lib/operaciones/telegram';
import { shiftDate, todayIn } from '@/lib/operaciones/jornada';
import { buildMorningBrief, buildWeeklyReport, mondayOf, weekRange, REPORT_TZ } from '@/lib/operaciones/reports';
import { MonthDrafts, MorningPreview, WeeklyView, type Draft } from './informes-view';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'semana', label: 'Informe semanal' },
  { key: 'parte', label: 'Parte de hoy' },
  { key: 'mes', label: 'Trabajo del mes' }
] as const;

// Operaciones → Informes (revisión de autonomía): el detalle de lo que llega por Telegram. Se calcula al abrir, de
// los datos guardados. Solo administración.
export default async function InformesPage({ searchParams }: { searchParams: Promise<{ vista?: string; semana?: string; mes?: string }> }) {
  const user = await requirePagePermission('admin');
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.vista)?.key ?? 'semana';
  const thisMonday = mondayOf(todayIn(REPORT_TZ));

  let body: React.ReactNode;
  if (view === 'semana') {
    const valid = sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) && sp.semana <= thisMonday ? mondayOf(sp.semana) : shiftDate(thisMonday, -7);
    const weeks = Array.from({ length: 8 }, (_, i) => shiftDate(thisMonday, -7 * i)).map((m) => ({ monday: m, label: i18nWeek(m, thisMonday) }));
    const report = await buildWeeklyReport(user.tenantId, valid);
    body = <WeeklyView report={report} weeks={weeks} />;
  } else if (view === 'parte') {
    const b = await buildMorningBrief(user.tenantId);
    body = <MorningPreview text={htmlToPlain(b.text)} notable={b.notable} />;
  } else {
    const offset: 0 | -1 = sp.mes === 'actual' ? 0 : -1;
    const clients = (await listClients(user.tenantId)).filter((c) => c.active && c.clickupOptionId);
    const drafts: Draft[] = [];
    let error: string | null = null;
    try {
      for (const c of clients) {
        const w = await getMonthWork(user.tenantId, c, offset);
        if (!w.items.length) continue;
        const fmt = (ms: number) => new Intl.DateTimeFormat('es-ES', { timeZone: REPORT_TZ, day: '2-digit', month: '2-digit' }).format(new Date(ms));
        drafts.push({
          client: c.name,
          count: w.items.length,
          text: `Trabajo realizado para ${c.name} en ${w.label}:\n\n${w.items.map((i) => `• ${i.title} (${fmt(i.doneMs)})`).join('\n')}\n\nUn saludo,\nEquipo Kijutech`
        });
      }
    } catch (e) {
      console.error('[informes] trabajo del mes:', e instanceof Error ? e.message : e);
      error = 'No se pudo leer ClickUp ahora mismo. Vuelve a intentarlo en un minuto.';
    }
    body = <MonthDrafts drafts={drafts} label={monthRange(offset).label} offset={offset} error={error} withoutField={(await listClients(user.tenantId)).filter((c) => c.active && !c.clickupOptionId).length} />;
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold">Informes</h2>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
          Lo que te llega por Telegram, con el detalle. El parte de la mañana sale de lunes a viernes solo si hay algo que contar; el semanal, los
          lunes; el aviso del trabajo del mes, el primer día laborable. Horas y opciones en Sistema → Automatizaciones → Informes.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Informe">
        {VIEWS.map((v) => (
          <Button key={v.key} asChild size="sm" variant={v.key === view ? 'default' : 'outline'} role="tab" aria-selected={v.key === view}>
            <Link href={`?vista=${v.key}`}>{v.label}</Link>
          </Button>
        ))}
      </div>
      {body}
    </div>
  );
}

function i18nWeek(monday: string, thisMonday: string): string {
  const w = weekRange(monday);
  if (monday === thisMonday) return `Esta semana (${w.label})`;
  if (monday === shiftDate(thisMonday, -7)) return `La semana pasada (${w.label})`;
  return w.label;
}
