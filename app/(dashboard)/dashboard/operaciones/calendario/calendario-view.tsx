'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import { addCalendarEntryAction, removeCalendarEntryAction } from '@/lib/operaciones/calendar-actions';
import type { CalendarEntry, CalendarKind } from '@/lib/operaciones/calendar';

const KINDS: { key: CalendarKind; label: string; tone: 'info' | 'success' | 'warning' }[] = [
  { key: 'festivo', label: '🎉 Festivo', tone: 'info' },
  { key: 'vacaciones', label: '🏖 Vacaciones', tone: 'success' },
  { key: 'ausencia', label: '🏠 Ausencia (médico, permiso…)', tone: 'warning' }
];
const fmt = (d: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`));

export function CalendarioView({ entries, people, today }: { entries: CalendarEntry[]; people: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<CalendarKind>('festivo');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [name, setName] = useState('');
  const [users, setUsers] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPast, setShowPast] = useState(false);

  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const upcoming = entries.filter((e) => e.to >= today);
  const past = entries.filter((e) => e.to < today).reverse();
  const needsPeople = kind !== 'festivo';

  const add = () =>
    start(async () => {
      setMsg(null);
      const r = await addCalendarEntryAction({ kind, from, to: to < from ? from : to, name, users: users.length ? users : null });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: 'Guardado. La jornada, los recordatorios y los plazos ya lo tienen en cuenta.' });
      setName('');
      setUsers([]);
      router.refresh();
    });

  const remove = (e: CalendarEntry) => {
    if (!window.confirm(`¿Quitar «${e.name}» (${fmt(e.from)}${e.to !== e.from ? ` – ${fmt(e.to)}` : ''}) del calendario?`)) return;
    start(async () => {
      const r = await removeCalendarEntryAction(e.id);
      setMsg(r.ok ? { ok: true, text: 'Quitado del calendario.' } : { ok: false, text: r.error });
      router.refresh();
    });
  };

  const row = (e: CalendarEntry) => {
    const k = KINDS.find((x) => x.key === e.kind)!;
    return (
      <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={k.tone}>{k.label.split(' (')[0]}</Badge>
            <span className="font-medium">{e.name}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {fmt(e.from)}
            {e.to !== e.from && ` – ${fmt(e.to)}`} ·{' '}
            {e.users && e.users.length ? e.users.map((u) => nameOf.get(u) ?? 'persona sin ficha').join(', ') : 'Toda la agencia'}
            <span className="text-xs"> · añadido por {e.createdBy}</span>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => remove(e)} disabled={pending} aria-label={`Quitar ${e.name}`}>
          <Trash2 className="size-4" aria-hidden /> Quitar
        </Button>
      </li>
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold">Calendario del equipo</h2>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
          Festivos y ausencias planificadas. Esos días el bot no da los buenos días ni insiste, los avisos normales esperan al siguiente día
          laborable, los recordatorios no cuentan ese tiempo y los plazos de los encargos saltan los festivos de toda la agencia.
        </p>
      </div>

      <Section title="Añadir" description="Un festivo puede ser de toda la agencia o solo de algunas personas (por ejemplo, de su país).">
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo">
            {KINDS.map((k) => (
              <Button key={k.key} type="button" size="sm" variant={kind === k.key ? 'default' : 'outline'} role="radio" aria-checked={kind === k.key} onClick={() => setKind(k.key)}>
                {k.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Desde *</span>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Hasta (incluido) *</span>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">{kind === 'festivo' ? 'Nombre *' : 'Motivo *'}</span>
              <Input value={name} maxLength={120} placeholder={kind === 'festivo' ? 'Inmaculada Concepción' : 'Vacaciones de Navidad'} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">
              {needsPeople ? 'Personas *' : 'A quién aplica'}{' '}
              {!needsPeople && <span className="font-normal text-muted-foreground">(sin marcar = toda la agencia)</span>}
            </legend>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay fichas activas con usuario de ClickUp.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {people.map((p) => {
                  const on = users.includes(p.id);
                  return (
                    <Button key={p.id} type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={() => setUsers(on ? users.filter((u) => u !== p.id) : [...users, p.id])}>
                      {p.name}
                    </Button>
                  );
                })}
              </div>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={add} disabled={pending || !name.trim() || (needsPeople && users.length === 0)}>
              <Plus className="size-4" aria-hidden /> Añadir al calendario
            </Button>
            {msg && (
              <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>
                {msg.text}
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title={`Próximos (${upcoming.length})`}>
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Sin festivos ni ausencias próximas" description="Añade los festivos del año y las vacaciones del equipo para que el bot no moleste esos días." className="m-4 border-0" />
        ) : (
          <ul className="divide-y">{upcoming.map(row)}</ul>
        )}
      </Section>

      {past.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowPast(!showPast)}>
            {showPast ? 'Ocultar pasados' : `Ver pasados (${past.length})`}
          </Button>
          {showPast && (
            <Section className="mt-2">
              <ul className="divide-y">{past.map(row)}</ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
