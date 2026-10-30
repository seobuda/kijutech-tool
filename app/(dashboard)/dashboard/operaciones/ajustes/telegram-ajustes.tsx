'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { saveDigestSettings, sendDigestNowAction } from '@/lib/operaciones/flow-actions';
import {
  activateWebhook,
  backToPolling,
  regenerateLinkCode,
  removeTelegramToken,
  retryFailedNotification,
  saveMemberSettings,
  saveTelegramToken,
  sendDailyNow,
  sendTestMessage,
  setTestMode,
  testTelegram,
  unlinkMember
} from '@/lib/operaciones/telegram-actions';

export type TelegramMemberView = {
  clickupUserId: string;
  username: string;
  isOwner: boolean;
  linked: boolean;
  telegramUsername: string | null;
  linkUrl: string | null;
  // De la ficha del Equipo (solo lectura aquí).
  timezone: string;
  workStart: string;
  dailyEnabled: boolean;
};

export type TelegramNotificationView = {
  id: string;
  createdAt: string;
  kind: string;
  forName: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  skipped: string | null;
};

export type TelegramView = {
  digestTimes: string;
  digestTimezone: string;
  hasBot: boolean;
  botName: string | null;
  botUsername: string | null;
  testMode: boolean;
  receiveMode: string;
  webhookUrl: string | null;
  pollAgeSeconds: number | null;
  lastError: string | null;
  workerRole: 'leader' | 'standby' | 'starting' | 'unknown';
  members: TelegramMemberView[];
  notifications: TelegramNotificationView[];
};

type Msg = { type: 'ok' | 'error'; text: string } | null;

const KIND_LABEL: Record<string, string> = {
  new_request: 'Encargo nuevo',
  daily_summary: 'Resumen diario',
  test: 'Prueba',
  review_request: 'Revisión urgente',
  block_alert: 'Bloqueo urgente',
  reply: 'Respuesta a la persona',
  returned: 'Devolución',
  digest: 'Resumen de la bandeja'
};

const dateTimeFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

export function TelegramAjustes({ view }: { view: TelegramView }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const [webhookBase, setWebhookBase] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: (r: never) => string) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(
        res.ok
          ? { type: 'ok', text: okText(res as never) }
          : { type: 'error', text: (res as { error?: string }).error ?? 'Error' }
      );
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avisos por Telegram</CardTitle>
        <CardDescription>
          Crea un bot con @BotFather, pega aquí su token y vincula a cada persona con su enlace personal. Los
          avisos de encargo nuevo se envían cuando ClickUp confirma la tarea; el resumen diario, a la hora de
          entrada de cada persona (lunes a viernes) en su zona horaria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Acciones de prueba, siempre arriba */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={pending || !view.hasBot}
              onClick={() => run(sendTestMessage, () => 'Mensaje de prueba en cola: debería llegarte en unos segundos.')}
            >
              Enviar mensaje de prueba
            </Button>
            <Button
              variant="outline"
              disabled={pending || !view.hasBot}
              onClick={() =>
                run(sendDailyNow, (r: { queued: number; withoutTasks: number }) =>
                  r.queued > 0
                    ? `Resumen en cola para ${r.queued} persona${r.queued === 1 ? '' : 's'} (${r.withoutTasks} sin tareas: no se envía).`
                    : `Nadie tiene tareas de hoy ni vencidas (${r.withoutTasks} sin tareas): no hay nada que enviar.`
                )
              }
            >
              Enviar resumen ahora
            </Button>
            {!view.hasBot && (
              <span className="text-sm text-muted-foreground">Guarda primero el token del bot (abajo).</span>
            )}
          </div>
          {view.hasBot && view.testMode && (
            <p className="text-xs text-muted-foreground">
              Modo pruebas activo: el resumen de todos llega a tu chat. Si aún no estás vinculado, vincúlate en «Personas».
            </p>
          )}
          {msg && (
            <p data-testid="tg-message" className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
              {msg.text}
            </p>
          )}
        </div>

        {/* Token */}
        <div className="space-y-2">
          <Label htmlFor="tg-token">
            {view.hasBot ? 'Sustituir token del bot' : 'Token del bot'} <span className="text-red-500">*</span>
          </Label>
          <Input
            id="tg-token"
            type="password"
            autoComplete="off"
            placeholder="123456789:AA..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={pending || !token.trim()}
              onClick={() =>
                run(
                  async () => {
                    const r = await saveTelegramToken(token);
                    if (r.ok) setToken('');
                    return r;
                  },
                  (r: { botName: string; botUsername: string }) =>
                    `Token guardado (cifrado). Bot: ${r.botName} (@${r.botUsername}).`
                )
              }
            >
              {view.hasBot ? 'Guardar nuevo token' : 'Guardar token'}
            </Button>
            <Button
              variant="outline"
              disabled={pending || !view.hasBot}
              onClick={() =>
                run(testTelegram, (r: { botName: string; botUsername: string }) =>
                  `✅ Conectado: el bot se llama «${r.botName}» (@${r.botUsername}).`
                )
              }
            >
              Probar
            </Button>
            {view.hasBot && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (window.confirm('¿Eliminar el bot de Telegram? Se dejan de enviar avisos.')) {
                    run(removeTelegramToken, () => 'Bot eliminado.');
                  }
                }}
              >
                Eliminar bot
              </Button>
            )}
            {view.hasBot && view.botUsername && (
              <span className="text-sm text-muted-foreground">
                Bot actual: <strong>{view.botName}</strong> (@{view.botUsername})
              </span>
            )}
          </div>
        </div>

        {view.hasBot && (
          <>
            {/* Modo pruebas */}
            <div className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
              <Switch
                checked={view.testMode}
                disabled={pending}
                onCheckedChange={(v) =>
                  run(
                    () => setTestMode(v),
                    () => (v ? 'Modo pruebas activado.' : 'Modo pruebas desactivado: los avisos irán a cada responsable.')
                  )
                }
              />
              <div className="text-sm">
                <p className="font-medium">Modo pruebas {view.testMode ? '(activado)' : '(desactivado)'}</p>
                <p className="text-muted-foreground">
                  Mientras esté activo, todos los avisos se envían solo al dueño (tú), indicando a quién iban
                  dirigidos. Desactívalo cuando el equipo ya esté vinculado.
                </p>
              </div>
            </div>

            {/* Estado de la escucha */}
            <ListenerStatus view={view} />

            {/* Personas */}
            <div className="space-y-2">
              <p className="font-medium text-sm">Personas</p>
              <div className="space-y-3">
                {view.members.map((m) => (
                  <MemberRow key={m.clickupUserId} m={m} botReady={Boolean(view.botUsername)} />
                ))}
                {view.members.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay miembros de ClickUp en la caché. Sincroniza ClickUp arriba.
                  </p>
                )}
              </div>
            </div>

            {/* Resúmenes de la bandeja (cortafuegos) */}
            <DigestBox view={view} />

            {/* Recepción */}
            <div className="space-y-2 rounded-md border border-gray-200 p-3">
              <p className="font-medium text-sm">
                Recepción de mensajes:{' '}
                {view.receiveMode === 'webhook' ? 'webhook' : 'consulta periódica (long polling)'}
              </p>
              {view.receiveMode === 'webhook' ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground break-all">Webhook activo: {view.webhookUrl}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(backToPolling, () => 'Vuelta a la consulta periódica.')}
                  >
                    Volver a consulta periódica
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    En local se usa consulta periódica (no hace falta dirección pública). Cuando la aplicación
                    esté en un servidor con https, escribe su dirección y activa el webhook.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="max-w-sm"
                      placeholder="https://tu-servidor.com"
                      value={webhookBase}
                      onChange={(e) => setWebhookBase(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || !webhookBase.trim()}
                      onClick={() => run(() => activateWebhook(webhookBase), () => 'Webhook activado.')}
                    >
                      Activar webhook
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Registro de avisos */}
            <div className="space-y-2">
              <p className="font-medium text-sm">Últimos avisos</p>
              {view.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no se ha enviado ningún aviso.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="w-full text-sm" data-testid="tg-notifications">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Cuándo</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Para</th>
                        <th className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {view.notifications.map((n) => (
                        <tr key={n.id} className="align-top">
                          <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">
                            {dateTimeFmt.format(new Date(n.createdAt))}
                          </td>
                          <td className="px-3 py-1.5">{KIND_LABEL[n.kind] ?? n.kind}</td>
                          <td className="px-3 py-1.5">{n.forName ?? '—'}</td>
                          <td className="px-3 py-1.5">
                            <span
                              className={`rounded px-2 py-0.5 text-xs ${
                                n.skipped
                                  ? 'bg-gray-100 text-gray-600'
                                  : n.status === 'enviado'
                                    ? 'bg-green-100 text-green-700'
                                    : n.status === 'fallido'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {n.skipped ? `omitido (${n.skipped})` : n.status}
                              {n.attempts > 0 && !n.skipped ? ` · ${n.attempts} intento${n.attempts === 1 ? '' : 's'}` : ''}
                            </span>
                            {n.lastError && n.status !== 'enviado' && (
                              <p className="mt-1 text-xs text-red-600 max-w-md">{n.lastError}</p>
                            )}
                            {n.status === 'fallido' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => run(() => retryFailedNotification(n.id), () => 'Reintentando…')}
                              >
                                Reintentar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ListenerStatus({ view }: { view: TelegramView }) {
  const conflict = view.lastError?.startsWith('CONFLICTO');
  if (view.receiveMode === 'webhook') return null;

  if (conflict) {
    return (
      <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700" data-testid="tg-conflict">
        <p className="font-medium">⚠️ Conflicto: hay más de un proceso escuchando este bot</p>
        <p>{view.lastError}</p>
        <p className="text-xs mt-1">
          Cierra el otro proceso (otro contenedor, otro ordenador o un webhook de otro entorno) que use este mismo
          token. Hasta entonces, los mensajes pueden perderse o llegar a medias.
        </p>
      </div>
    );
  }
  if (view.lastError) {
    return (
      <p className="text-sm text-red-600" data-testid="tg-listener">
        Error de la escucha: {view.lastError}
      </p>
    );
  }
  const fresh = view.pollAgeSeconds !== null && view.pollAgeSeconds < 120;
  return (
    <p className={`text-sm ${fresh ? 'text-green-700' : 'text-amber-700'}`} data-testid="tg-listener">
      {fresh
        ? `🟢 Escuchando a Telegram (última consulta hace ${view.pollAgeSeconds} s).`
        : view.pollAgeSeconds === null
          ? '🟡 Aún no ha habido ninguna consulta a Telegram.'
          : `🟡 Sin actividad de la escucha desde hace ${view.pollAgeSeconds} s.`}{' '}
      <span className="text-muted-foreground">
        Este proceso es{' '}
        {view.workerRole === 'leader'
          ? 'el que escucha'
          : view.workerRole === 'standby'
            ? 'de reserva (otro proceso tiene el candado de escucha)'
            : 'desconocido'}
        .
      </span>
    </p>
  );
}

function MemberRow({ m, botReady }: { m: TelegramMemberView; botReady: boolean }) {
  const router = useRouter();
  const [daily, setDaily] = useState(m.dailyEnabled);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const dirty = daily !== m.dailyEnabled;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(res.ok ? { type: 'ok', text: okText } : { type: 'error', text: res.error ?? 'Error' });
      router.refresh();
    });

  return (
    <div className="rounded-md border border-gray-200 p-3 space-y-2" data-testid={`tg-member-${m.clickupUserId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-sm">
          {m.username}
          {m.isOwner && <span className="ml-1 text-xs text-muted-foreground">(yo)</span>}
        </p>
        <span
          className={`rounded px-2 py-0.5 text-xs ${m.linked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
        >
          {m.linked ? `vinculado${m.telegramUsername ? ` · @${m.telegramUsername}` : ''}` : 'sin vincular'}
        </span>
        {m.linked && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => act(() => unlinkMember(m.clickupUserId), 'Desvinculado.')}
          >
            Desvincular
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {m.linkUrl ? (
          <>
            <Input readOnly value={m.linkUrl} className="max-w-md text-xs font-mono" data-testid="tg-link" />
            <Button
              size="sm"
              variant="outline"
              disabled={!botReady}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(m.linkUrl!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  // sin portapapeles: el enlace queda seleccionable en el campo
                }
              }}
            >
              {copied ? '¡Copiado!' : 'Copiar enlace'}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {m.linked ? 'Enlace usado.' : 'Sin enlace activo.'}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            act(
              () => regenerateLinkCode(m.clickupUserId),
              'Enlace nuevo generado: el anterior ya no vale.'
            )
          }
        >
          {m.linkUrl ? 'Generar enlace nuevo' : 'Generar enlace'}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <p className="text-xs text-muted-foreground pb-2">
          Entrada {m.workStart} · {m.timezone}. Se editan en{' '}
          <Link href="/dashboard/operaciones/equipo" className="text-orange-600 hover:underline">
            Equipo
          </Link>
          .
        </p>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input
            type="checkbox"
            checked={daily}
            onChange={(e) => setDaily(e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          Resumen diario
        </label>
        <Button
          size="sm"
          disabled={pending || !dirty}
          onClick={() =>
            act(
              () => saveMemberSettings({ clickupUserId: m.clickupUserId, dailyEnabled: daily }),
              'Guardado.'
            )
          }
        >
          Guardar
        </Button>
      </div>
      {msg && <p className={`text-xs ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
}

// Cortafuegos de avisos: solo lo urgente llega al instante; el resto, en dos resúmenes al día.
function DigestBox({ view }: { view: TelegramView }) {
  const router = useRouter();
  const [times, setTimes] = useState(view.digestTimes.split(',').join(', '));
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; sent?: boolean }>, text: (r: { sent?: boolean }) => string) =>
    startTransition(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(res.ok ? { type: 'ok', text: text(res) } : { type: 'error', text: res.error ?? 'Error' });
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-3">
      <p className="font-medium text-sm">Resúmenes de «Mi bandeja» para ti</p>
      <p className="text-xs text-muted-foreground">
        Solo los bloqueos y las revisiones de encargos <strong>urgentes</strong> te llegan al instante. Todo lo demás
        (qué se ha completado, qué ha resuelto el agente solo y qué necesita de ti) va en estos resúmenes, de lunes a
        viernes.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="digest-times">Horas (HH:MM, separadas por comas)</Label>
          <Input id="digest-times" className="w-48" value={times} onChange={(e) => setTimes(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground pb-2">
          Hora de {view.digestTimezone} (zona de tu ficha en{' '}
          <Link href="/dashboard/operaciones/equipo" className="text-orange-600 hover:underline">
            Equipo
          </Link>
          ).
        </p>
        <Button size="sm" disabled={pending} onClick={() => run(() => saveDigestSettings(times), () => 'Horas guardadas.')}>
          Guardar
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(sendDigestNowAction, (r) =>
              r.sent ? 'Resumen en cola: te llegará en unos segundos.' : 'No hay novedades ni nada pendiente de ti: no hay nada que enviar.'
            )
          }
        >
          Enviar resumen de la bandeja ahora
        </Button>
      </div>
      {msg && <p className={`text-xs ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
}
