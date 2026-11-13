'use client';

// Pestaña «Competencia»: con quién compite el cliente. Lo usarán el analista de competencia del onboarding y las
// estrategias. Los que propone un agente quedan marcados.
import { useState } from 'react';
import { Bot, Pencil, Plus, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import { deleteCompetitorAction, saveCompetitorAction } from '@/lib/core/client-actions';
import { areaClass, brandBtn, ConfirmDelete, MsgLine, useRun } from '../ui';
import { Field } from './tab-contactos';
import type { CompetitorView } from './ficha-view';

const empty: CompetitorView = { id: '', name: '', domain: '', notes: '', source: 'manual' };

export function CompetenciaTab({ clientId, competitors }: { clientId: string; competitors: CompetitorView[] }) {
  const [edit, setEdit] = useState<string | null>(null);
  const { run, pending, msg } = useRun();
  const save = (v: CompetitorView, id: string | null) => run(() => saveCompetitorAction(clientId, { id, name: v.name, domain: v.domain, notes: v.notes }), id ? 'Guardado.' : 'Competidor añadido.', () => setEdit(null));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Quién compite por sus clientes y sus búsquedas. Con el dominio, los agentes pueden comparar posiciones y contenidos.</p>
        <Button size="sm" variant="outline" disabled={edit !== null} onClick={() => setEdit('new')}>
          <Plus aria-hidden />
          Añadir competidor
        </Button>
      </div>
      <MsgLine msg={msg} />
      {edit === 'new' && <CompetitorForm initial={empty} pending={pending} onCancel={() => setEdit(null)} onSave={(v) => save(v, null)} />}
      {competitors.length === 0 && edit !== 'new' ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Sin competidores. Añade los que nombre el cliente o los que veas en Google para sus búsquedas.</p>
      ) : (
        <ul className="space-y-2">
          {competitors.map((c) =>
            edit === c.id ? (
              <li key={c.id}>
                <CompetitorForm initial={c} pending={pending} onCancel={() => setEdit(null)} onSave={(v) => save(v, c.id)} />
              </li>
            ) : (
              <li key={c.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Swords className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      {c.name}
                      {c.source === 'agente' && (
                        <Badge tone="info">
                          <Bot aria-hidden />
                          propuesto por un agente
                        </Badge>
                      )}
                    </p>
                    {c.domain && (
                      <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                        {c.domain}
                      </a>
                    )}
                    {c.notes && <p className="text-xs text-muted-foreground whitespace-pre-line">{c.notes}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button size="sm" variant="ghost" disabled={pending || edit !== null} onClick={() => setEdit(c.id)}>
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                  <ConfirmDelete what={c.name} disabled={pending} onConfirm={() => run(() => deleteCompetitorAction(clientId, c.id), 'Competidor eliminado.')} />
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function CompetitorForm({ initial, pending, onSave, onCancel }: { initial: CompetitorView; pending: boolean; onSave: (v: CompetitorView) => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const set = (p: Partial<CompetitorView>) => setF((c) => ({ ...c, ...p }));
  return (
    <div className="space-y-3 rounded-lg border border-brand/40 bg-card p-3 shadow-sm" data-testid="competidor-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Dominio">
          <Input value={f.domain} onChange={(e) => set({ domain: e.target.value })} placeholder="competidor.com" />
        </Field>
        <Field label="Notas" wide>
          <textarea rows={2} className={areaClass} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Qué hacen mejor o peor, en qué búsquedas compiten…" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className={brandBtn} disabled={pending || (!f.name.trim() && !f.domain.trim())} onClick={() => onSave(f)}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
