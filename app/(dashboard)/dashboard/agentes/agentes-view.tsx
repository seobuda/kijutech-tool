'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bot, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Section } from '@/components/ui/page';
import { chatWithAgentAction, deleteAgentAction, saveAgentAction } from '@/lib/agentes/actions';
import { setToolAutonomyAction } from '@/lib/operaciones/agent-capabilities-actions';

export type AgentRow = {
  id: string;
  key: string;
  name: string;
  kind: 'principal' | 'subagente';
  role: string;
  instructions: string;
  tools: string[];
  model: string | null;
  voice: string | null;
  monthlyBudgetUsd: number | null;
  active: boolean;
  spentMonth: number;
};
export type ToolOption = { name: string; title: string; module: string; risk: 'lectura' | 'cambio' };

const MODULE_LABEL: Record<string, string> = { operaciones: 'Operaciones', agentes: 'Agentes e integraciones', anthropic: 'Web (Anthropic)' };
const AUTONOMY: { key: string; label: string }[] = [
  { key: 'sombra', label: 'En sombra' },
  { key: 'aprobacion', label: 'Con tu aprobación' },
  { key: 'autonomo', label: 'Autónomo' }
];
const area = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';

const empty = (): AgentRow => ({ id: '', key: '', name: '', kind: 'subagente', role: '', instructions: '', tools: [], model: null, voice: null, monthlyBudgetUsd: 10, active: true, spentMonth: 0 });

export function AgentesView({ agents, tools, voices, autonomies }: { agents: AgentRow[]; tools: ToolOption[]; voices: string[]; autonomies: { name: string; title: string; autonomy: string }[] }) {
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [chatWith, setChatWith] = useState<AgentRow | null>(null);
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing(empty())}>
          <Plus className="size-4" aria-hidden /> Nuevo agente
        </Button>
      </div>
      {editing && <AgentForm key={editing.id || 'nuevo'} agent={editing} tools={tools} voices={voices} onClose={() => setEditing(null)} />}
      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((a) => (
          <section key={a.id} className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Bot className="size-4 text-muted-foreground" aria-hidden /> {a.name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {a.key} · {a.kind === 'principal' ? 'Principal (Telegram y correo)' : 'Subagente (trabajos)'}
                </p>
              </div>
              <div className="flex gap-1">
                {!a.active && <Badge tone="neutral">Desactivado</Badge>}
                <Badge tone={a.monthlyBudgetUsd && a.spentMonth >= a.monthlyBudgetUsd ? 'warning' : 'neutral'}>
                  {a.spentMonth.toFixed(2)} ${a.monthlyBudgetUsd ? ` de ${a.monthlyBudgetUsd} $` : ''} este mes
                </Badge>
              </div>
            </div>
            <p className="mt-2 text-sm text-pretty">{a.role}</p>
            <p className="mt-2 text-xs text-muted-foreground">{a.tools.length} herramientas · modelo {a.model ?? 'el configurado'}{a.voice ? ` · voz ${a.voice}` : ''}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                Editar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setChatWith(a)}>
                Probar
              </Button>
            </div>
          </section>
        ))}
      </div>
      {chatWith && <ChatPanel agent={chatWith} onClose={() => setChatWith(null)} />}
      <Section title="Autonomía de las acciones" description="Cuando un agente propone un cambio desde una conversación. «Con tu aprobación»: te llega con botones. «Autónomo»: lo hace y queda registrado. «En sombra»: solo se anota para medir. Empieza todo con tu aprobación; la pestaña Operaciones → Agente mide cuánto aciertan.">
        <ul className="divide-y text-sm">
          {autonomies.map((t) => (
            <AutonomyRow key={t.name} tool={t} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function AutonomyRow({ tool }: { tool: { name: string; title: string; autonomy: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(tool.autonomy);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
      <span>{tool.title}</span>
      <select
        aria-label={`Autonomía de ${tool.title}`}
        className="h-8 rounded-md border bg-background px-2 text-sm"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          start(async () => {
            const r = await setToolAutonomyAction(tool.name, v);
            if (!r.ok) setValue(tool.autonomy);
            router.refresh();
          });
        }}
      >
        {AUTONOMY.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
    </li>
  );
}

function AgentForm({ agent, tools, voices, onClose }: { agent: AgentRow; tools: ToolOption[]; voices: string[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [a, setA] = useState(agent);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof AgentRow>(k: K, v: AgentRow[K]) => setA((x) => ({ ...x, [k]: v }));
  const groups = [...new Set(tools.map((t) => t.module))];

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveAgentAction({ id: a.id || null, key: a.key, name: a.name, kind: a.kind, role: a.role, instructions: a.instructions, tools: a.tools, model: a.model || null, voice: a.voice || null, monthlyBudgetUsd: a.monthlyBudgetUsd, active: a.active });
      if (!r.ok) return setMsg(r.error);
      router.refresh();
      onClose();
    });
  const remove = () => {
    if (!window.confirm(`¿Borrar el agente «${a.name}»? Se borran también sus conversaciones y trabajos.`)) return;
    start(async () => {
      const r = await deleteAgentAction(a.id);
      if (!r.ok) return setMsg(r.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <Section title={a.id ? `Editar «${agent.name}»` : 'Nuevo agente'} description="El rol y las instrucciones son su «ficha»: qué hace, con qué criterio y cómo informa. Solo podrá usar las herramientas que marques.">
      <div className="space-y-4 px-5 py-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1 block font-medium">Nombre *</span>
            <Input value={a.name} onChange={(e) => set('name', e.target.value)} placeholder="Redactor SEO" />
          </label>
          <label>
            <span className="mb-1 block font-medium">Clave *</span>
            <Input value={a.key} disabled={Boolean(a.id)} onChange={(e) => set('key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="redactor_seo" />
          </label>
          <label>
            <span className="mb-1 block font-medium">Tipo</span>
            <select className="h-9 w-full rounded-md border bg-background px-2" value={a.kind} onChange={(e) => set('kind', e.target.value as AgentRow['kind'])}>
              <option value="subagente">Subagente (hace trabajos encargados)</option>
              <option value="principal">Principal (habla por Telegram y correo)</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block font-medium">Rol (una o dos frases) *</span>
          <textarea className={area} rows={2} value={a.role} onChange={(e) => set('role', e.target.value)} placeholder="Escribe artículos con el tono de cada cliente a partir de su ficha y su estrategia." />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Instrucciones</span>
          <textarea className={area} rows={8} value={a.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Cómo trabaja, qué criterio sigue, qué formato tiene su informe…" />
        </label>
        <fieldset>
          <legend className="mb-1 font-medium">Herramientas</legend>
          <div className="grid gap-3 md:grid-cols-3">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{MODULE_LABEL[g] ?? g}</p>
                {tools
                  .filter((t) => t.module === g)
                  .map((t) => (
                    <label key={t.name} className="flex items-start gap-2 py-0.5">
                      <input type="checkbox" className="mt-1" checked={a.tools.includes(t.name)} onChange={(e) => set('tools', e.target.checked ? [...a.tools, t.name] : a.tools.filter((x) => x !== t.name))} />
                      <span>
                        {t.title} {t.risk === 'cambio' && <Badge tone="warning">con aprobación</Badge>}
                      </span>
                    </label>
                  ))}
              </div>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-4">
          <label>
            <span className="mb-1 block font-medium">Modelo</span>
            <Input value={a.model ?? ''} onChange={(e) => set('model', e.target.value || null)} placeholder="El configurado" />
          </label>
          <label>
            <span className="mb-1 block font-medium">Voz (audios)</span>
            <select className="h-9 w-full rounded-md border bg-background px-2" value={a.voice ?? ''} onChange={(e) => set('voice', e.target.value || null)}>
              <option value="">Por defecto (marin)</option>
              {voices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block font-medium">Presupuesto mensual (USD)</span>
            <Input type="number" min={0} step="1" value={a.monthlyBudgetUsd ?? ''} onChange={(e) => set('monthlyBudgetUsd', e.target.value === '' ? null : Number(e.target.value))} placeholder="Sin tope" />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={a.active} onChange={(e) => set('active', e.target.checked)} /> Activo
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={pending || !a.name.trim() || !a.key.trim() || !a.role.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Guardar
          </Button>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          {a.id && (
            <Button variant="ghost" onClick={remove} disabled={pending}>
              <Trash2 className="size-4" aria-hidden /> Borrar
            </Button>
          )}
          {msg && (
            <p role="alert" className="text-destructive">
              {msg}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

function ChatPanel({ agent, onClose }: { agent: AgentRow; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState('');
  const [log, setLog] = useState<{ who: 'tú' | 'agente'; text: string; meta?: string }[]>([]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    setLog((l) => [...l, { who: 'tú', text: t }]);
    setText('');
    start(async () => {
      const r = await chatWithAgentAction(agent.id, t);
      setLog((l) => [...l, r.ok ? { who: 'agente', text: r.reply, meta: `${r.tools.length ? `herramientas: ${r.tools.join(', ')} · ` : ''}${r.costUsd.toFixed(4)} $` } : { who: 'agente', text: r.error }]);
    });
  };
  return (
    <Section
      title={`Probar «${agent.name}»`}
      description={agent.kind === 'subagente' ? 'Como si le encargaras un trabajo: la respuesta es su informe.' : 'Como por Telegram. Las acciones de cambio te llegarán igualmente a Telegram con botones.'}
      actions={
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="max-h-[28rem] space-y-3 overflow-y-auto" aria-live="polite">
          {log.length === 0 && <p className="text-muted-foreground">Escribe algo, por ejemplo «¿cómo va el equipo hoy?».</p>}
          {log.map((m, i) => (
            <div key={i} className={m.who === 'tú' ? 'text-right' : ''}>
              <div className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left ${m.who === 'tú' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{m.text.replace(/<[^>]+>/g, '')}</div>
              {m.meta && <p className="mt-0.5 text-xs text-muted-foreground">{m.meta}</p>}
            </div>
          ))}
          {pending && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Pensando…
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !pending && send()} placeholder="Escribe al agente…" aria-label="Mensaje al agente" />
          <Button onClick={send} disabled={pending || !text.trim()} aria-label="Enviar">
            <Send className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </Section>
  );
}
