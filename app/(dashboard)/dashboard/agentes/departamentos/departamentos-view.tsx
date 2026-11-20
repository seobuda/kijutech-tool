'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Building2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Section } from '@/components/ui/page';
import { checkDeptBotAction, removeDeptBotAction, saveDeptBotAction } from '@/lib/operaciones/dept-bot-actions';

export type DeptView = {
  key: string;
  name: string;
  description: string;
  reportsTo: string;
  head: { name: string; active: boolean } | null;
  members: { name: string; kind: string; active: boolean }[];
  botKey: string | null;
  bot: { username: string | null; name: string | null; ready: boolean; lastError: string | null } | null;
};

const KIND: Record<string, string> = { principal: 'principal', jefe: 'jefe', subagente: 'subagente' };

export function DepartamentosView({ departments, webhookReady }: { departments: DeptView[]; webhookReady: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-pretty">
        El organigrama de la agencia: cada departamento con su jefe, quién trabaja en él y a quién reporta. Un departamento con chat propio te escribe por su
        bot de Telegram; si el bot no está listo, sus avisos llegan por el chat principal, así que nunca se pierde nada. Los departamentos sin jefe todavía los
        lleva el agente principal.
      </p>
      {departments.map((d) => (
        <DeptCard key={d.key} d={d} webhookReady={webhookReady} />
      ))}
    </div>
  );
}

function DeptCard({ d, webhookReady }: { d: DeptView; webhookReady: boolean }) {
  return (
    <Section
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" aria-hidden /> {d.name}
          {d.head ? <Badge tone={d.head.active ? 'brand' : 'neutral'}>Jefe: {d.head.name}{d.head.active ? '' : ' (desactivado)'}</Badge> : <Badge>Sin jefe todavía</Badge>}
        </span>
      }
      description={d.description}
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Reporta a</dt>
            <dd>{d.reportsTo}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Agentes del departamento</dt>
            <dd>{d.members.length ? d.members.map((m) => `${m.name} (${KIND[m.kind] ?? m.kind}${m.active ? '' : ', desactivado'})`).join(' · ') : 'Ninguno más'}</dd>
          </div>
        </dl>
        {d.botKey && <BotPanel deptKey={d.key} botKey={d.botKey} bot={d.bot} webhookReady={webhookReady} />}
      </div>
    </Section>
  );
}

function BotPanel({ deptKey, botKey, bot, webhookReady }: { deptKey: string; botKey: string; bot: DeptView['bot']; webhookReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = () =>
    start(async () => {
      const r = await saveDeptBotAction(botKey, token);
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) setToken('');
      router.refresh();
    });
  const check = () =>
    start(async () => {
      const r = await checkDeptBotAction(botKey);
      setMsg(r.ok ? { ok: r.ready, text: r.ready ? 'Listo: te acaba de escribir por Telegram.' : 'Todavía no puede escribirte: abre su chat en Telegram y pulsa «Iniciar».' } : { ok: false, text: r.error });
      router.refresh();
    });
  const remove = () =>
    start(async () => {
      const r = await removeDeptBotAction(botKey);
      setConfirmRemove(false);
      setMsg(r.ok ? { ok: true, text: 'Bot quitado: sus avisos vuelven al chat principal.' } : { ok: false, text: r.error });
      router.refresh();
    });
  return (
    <div className="space-y-3 rounded-lg border px-4 py-3">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <Send className="size-4 text-muted-foreground" aria-hidden /> Chat de Telegram del departamento
        {bot ? (
          bot.ready ? (
            <Badge tone="success">Listo · @{bot.username}</Badge>
          ) : (
            <Badge tone="warning">Falta pulsar «Iniciar» · @{bot.username}</Badge>
          )
        ) : (
          <Badge>Sin bot: sus avisos van al chat principal</Badge>
        )}
      </p>
      {!bot && (
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>En Telegram, abre @BotFather, escribe /newbot y ponle nombre (p. ej. «Kijutech Sistema»).</li>
          <li>Pega aquí el token que te da y pulsa Guardar.</li>
          <li>Abre el chat con el bot nuevo y pulsa «Iniciar».</li>
        </ol>
      )}
      {bot && !bot.ready && bot.username && (
        <p className="text-muted-foreground">
          Abre{' '}
          <a className="underline" href={`https://t.me/${bot.username}`} target="_blank" rel="noreferrer">
            t.me/{bot.username}
          </a>{' '}
          , pulsa «Iniciar» y después «Comprobar».
        </p>
      )}
      {!webhookReady && <p className="text-warning-strong">Los bots de departamento solo funcionan en el servidor (con el bot principal en modo webhook).</p>}
      <label className="block" htmlFor={`token-${deptKey}`}>
        <span className="mb-1 block">{bot ? 'Cambiar el token (opcional)' : 'Token del bot'}</span>
        <Input
          id={`token-${deptKey}`}
          type="password"
          autoComplete="off"
          value={token}
          placeholder={bot ? '•••••• (guardado; pega otro para cambiarlo)' : '123456789:AA…'}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      {bot?.lastError && <p className="text-destructive">Último error: {bot.lastError}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending || !token.trim() || !webhookReady}>
          Guardar
        </Button>
        {bot && !bot.ready && (
          <Button size="sm" variant="outline" onClick={check} disabled={pending}>
            Comprobar
          </Button>
        )}
        {bot &&
          (confirmRemove ? (
            <>
              <span className="text-destructive">¿Quitar el bot? Sus avisos volverán al chat principal.</span>
              <Button size="sm" variant="destructive" onClick={remove} disabled={pending}>
                Sí, quitar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)} disabled={pending}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)} disabled={pending}>
              Quitar
            </Button>
          ))}
        {msg && (
          <p role="status" className={msg.ok ? 'text-success' : 'text-destructive'}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
