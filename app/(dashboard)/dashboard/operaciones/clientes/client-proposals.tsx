'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { History, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/page';
import { applyClientProposalAction, getClientProposalsAction } from '@/lib/operaciones/client-proposal-actions';
import type { ClientProposal } from '@/lib/operaciones/client-proposals';

type Choice = { services: Record<string, { on: boolean; responsibleId: string }>; lists: Record<string, boolean> };

// «Completar fichas con el historial de ClickUp»: se carga al pulsar (la pantalla no llama a ClickUp para pintarse).
export function ClientProposals({ incomplete }: { incomplete: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, start] = useTransition();
  const [data, setData] = useState<{ proposals: ClientProposal[]; members: { id: string; name: string }[]; scanned: number; truncated: boolean } | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = (force = false) =>
    start(async () => {
      setError(null);
      const r = await getClientProposalsAction(force);
      if (!r.ok) return setError(r.error);
      setData(r);
      const c: Record<string, Choice> = {};
      for (const p of r.proposals) {
        c[p.clientId] = {
          services: Object.fromEntries(p.services.map((s) => [s.key, { on: !p.hasServices, responsibleId: s.responsible?.id ?? '' }])),
          lists: Object.fromEntries(p.lists.map((l) => [l.id, !p.hasLists]))
        };
      }
      setChoices(c);
      setOpen(true);
    });

  const apply = (p: ClientProposal) =>
    start(async () => {
      const ch = choices[p.clientId];
      const r = await applyClientProposalAction({
        clientId: p.clientId,
        services: Object.entries(ch.services)
          .filter(([, v]) => v.on)
          .map(([key, v]) => ({ key, responsibleId: v.responsibleId || null })),
        listIds: Object.entries(ch.lists)
          .filter(([, v]) => v)
          .map(([id]) => id)
      });
      setDone((d) => ({ ...d, [p.clientId]: r.ok ? `Aplicado (${r.added} servicio(s))` : r.error }));
      if (r.ok) router.refresh();
    });

  const setSvc = (cid: string, key: string, patch: Partial<{ on: boolean; responsibleId: string }>) =>
    setChoices((c) => ({ ...c, [cid]: { ...c[cid], services: { ...c[cid].services, [key]: { ...c[cid].services[key], ...patch } } } }));
  const setList = (cid: string, id: string, on: boolean) => setChoices((c) => ({ ...c, [cid]: { ...c[cid], lists: { ...c[cid].lists, [id]: on } } }));

  return (
    <section className="rounded-xl border border-info/30 bg-info-soft/40 shadow-xs" aria-label="Completar fichas con el historial">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <History className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <div>
            <p className="text-sm font-medium">
              {incomplete} ficha(s) sin servicios o sin listas habituales: no generan alertas ni proponen responsable.
            </p>
            <p className="text-sm text-muted-foreground">
              Propuestas a partir de sus tareas de ClickUp de los últimos 6 meses (servicio por el nombre del espacio y la lista, responsable
              por quién más tareas lleva). Revisa y aplica: nunca se sobrescribe lo que ya está en la ficha.
            </p>
          </div>
        </div>
        <Button size="sm" variant={open ? 'outline' : 'default'} onClick={() => (open ? setOpen(false) : load())} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {open ? 'Ocultar' : 'Ver propuestas'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="px-5 pb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {open && data && (
        <div className="space-y-3 border-t px-5 py-4">
          <p className="text-xs text-muted-foreground">
            {data.scanned} tareas revisadas{data.truncated ? ' (se cortó en el máximo: puede faltar historial)' : ''}.{' '}
            <button type="button" className="underline" onClick={() => load(true)} disabled={loading}>
              Volver a consultar ClickUp
            </button>
          </p>
          {data.proposals.length === 0 && <p className="text-sm">No hay propuestas: las fichas incompletas no tienen tareas con su opción del campo «Cliente» en ClickUp.</p>}
          {data.proposals.map((p) => {
            const ch = choices[p.clientId];
            if (!ch) return null;
            return (
              <div key={p.clientId} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {p.name} <span className="text-sm font-normal text-muted-foreground">· {p.tasks} tarea(s){p.lastDays !== null ? ` · última hace ${p.lastDays} días` : ''}</span>
                  </p>
                  {done[p.clientId] ? (
                    <Badge tone={done[p.clientId].startsWith('Aplicado') ? 'success' : 'warning'}>{done[p.clientId]}</Badge>
                  ) : (
                    <Button size="sm" onClick={() => apply(p)} disabled={loading}>
                      Aplicar
                    </Button>
                  )}
                </div>
                {p.services.length > 0 && (
                  <fieldset className="mt-3">
                    <legend className="text-xs font-medium text-muted-foreground">Servicios {p.hasServices && '(la ficha ya tiene alguno: solo se añaden los nuevos)'}</legend>
                    <ul className="mt-1 space-y-1">
                      {p.services.map((s) => (
                        <li key={s.key} className="flex flex-wrap items-center gap-2 text-sm">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={ch.services[s.key]?.on ?? false} onChange={(e) => setSvc(p.clientId, s.key, { on: e.target.checked })} />
                            {s.label} <span className="text-muted-foreground">({s.tasks} tareas)</span>
                          </label>
                          <select
                            aria-label={`Responsable de ${s.label}`}
                            className="h-8 rounded-md border bg-background px-2 text-sm"
                            value={ch.services[s.key]?.responsibleId ?? ''}
                            onChange={(e) => setSvc(p.clientId, s.key, { responsibleId: e.target.value })}
                          >
                            <option value="">Sin responsable</option>
                            {data.members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                )}
                {p.lists.length > 0 && !p.hasLists && (
                  <fieldset className="mt-3">
                    <legend className="text-xs font-medium text-muted-foreground">Listas habituales</legend>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm">
                      {p.lists.map((l) => (
                        <label key={l.id} className="flex items-center gap-2">
                          <input type="checkbox" checked={ch.lists[l.id] ?? false} onChange={(e) => setList(p.clientId, l.id, e.target.checked)} />
                          {l.name} <span className="text-muted-foreground">({l.tasks})</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
