'use client';

// Ajustes de Google Ads: tres bloques (conexión, descarga, cuentas). Cada bloque guarda por separado y dice qué ha
// pasado; los campos obligatorios llevan «*». La clave pegada nunca vuelve del servidor: solo «guardada» y su pista.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, KeyRound, Plug, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import {
  linkAdsAccountAction,
  removeAdsCredentialsAction,
  saveAdsCredentialsAction,
  saveAdsDeveloperTokenAction,
  saveAdsSettingsAction,
  setAdsAccountTrackedAction,
  setAdsClientLevelAction,
  startAdsSyncNowAction,
  testAdsConnectionAction
} from '@/lib/ads/actions';
import type { AdsAccountView } from '@/lib/ads/access';
import type { PublicAdsSettings } from '@/lib/ads/settings';

type Msg = { ok: boolean; text: string } | null;

function Flash({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={msg.ok ? 'flex items-start gap-1.5 text-sm text-success' : 'flex items-start gap-1.5 text-sm text-destructive'}>
      {msg.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{msg.text}</span>
    </p>
  );
}

export function AjustesView({ settings, accounts, clients }: { settings: PublicAdsSettings; accounts: AdsAccountView[]; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [credMsg, setCredMsg] = useState<Msg>(null);
  const [testMsg, setTestMsg] = useState<Msg>(null);
  const [testAccounts, setTestAccounts] = useState<{ customerId: string; name: string | null; status: string | null }[]>([]);
  const [syncMsg, setSyncMsg] = useState<Msg>(null);
  const [accMsg, setAccMsg] = useState<Msg>(null);

  const [keyText, setKeyText] = useState('');
  const [mcc, setMcc] = useState(settings.mccCustomerId ?? '');
  const [devToken, setDevToken] = useState('');
  const [apiVersion, setApiVersion] = useState(settings.apiVersion);
  const [sunset, setSunset] = useState(settings.apiVersionSunset ?? '');
  const [budget, setBudget] = useState(String(settings.dailyOpsBudget));
  const [months, setMonths] = useState(String(settings.historyMonths));
  const [domains, setDomains] = useState(settings.agencyEmailDomains.join(', '));
  const [emails, setEmails] = useState(settings.agencyUserEmails.join(', '));
  const isSim = settings.authMode === 'sim';
  const split = (v: string) => v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

  const run = (fn: () => Promise<void>) => start(async () => {
    await fn();
    router.refresh();
  });

  const saveKey = () =>
    run(async () => {
      const r = await saveAdsCredentialsAction(keyText);
      setCredMsg(r.ok ? { ok: true, text: r.mode === 'sim' ? 'Modo simulado activado. Ahora prueba la conexión y activa la descarga.' : `Clave guardada (${r.hint}). Ahora pon el id de la MCC y prueba la conexión.` } : { ok: false, text: r.error });
      if (r.ok) setKeyText('');
    });
  const removeKey = () => {
    if (!window.confirm('¿Quitar la credencial? La descarga se apaga; lo ya descargado se queda.')) return;
    run(async () => {
      const r = await removeAdsCredentialsAction();
      setCredMsg(r.ok ? { ok: true, text: 'Credencial quitada y descarga apagada.' } : { ok: false, text: r.error });
    });
  };
  const saveConnection = () =>
    run(async () => {
      const r = await saveAdsSettingsAction({ mccCustomerId: mcc, apiVersion, apiVersionSunset: sunset || null });
      let text = r.ok ? 'Conexión guardada.' : r.error;
      if (r.ok && devToken.trim()) {
        const t = await saveAdsDeveloperTokenAction(devToken);
        text = t.ok ? 'Conexión y token de desarrollador guardados.' : t.error;
        if (t.ok) setDevToken('');
        setCredMsg({ ok: t.ok, text });
        return;
      }
      setCredMsg({ ok: r.ok, text });
    });
  const removeDevToken = () =>
    run(async () => {
      const r = await saveAdsDeveloperTokenAction(null);
      setCredMsg(r.ok ? { ok: true, text: 'Token de desarrollador quitado.' } : { ok: false, text: r.error });
    });
  const test = () =>
    run(async () => {
      const r = await testAdsConnectionAction();
      setTestMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      setTestAccounts(r.ok ? r.accounts : []);
    });
  const saveSync = (enabled: boolean) =>
    run(async () => {
      const r = await saveAdsSettingsAction({ syncEnabled: enabled, dailyOpsBudget: Number(budget), historyMonths: Number(months), agencyEmailDomains: split(domains), agencyUserEmails: split(emails) });
      setSyncMsg(r.ok ? { ok: true, text: enabled ? 'Guardado. La descarga está activada: la lista de cuentas llega en unos minutos y el histórico se baja por tramos.' : 'Guardado. La descarga está apagada.' } : { ok: false, text: r.error });
    });
  const syncNow = () =>
    run(async () => {
      const r = await startAdsSyncNowAction();
      setSyncMsg(r.ok ? { ok: true, text: `Encolados ${r.queued} trabajos de descarga. Vuelve a Google Ads en un par de minutos.` } : { ok: false, text: r.error });
    });

  return (
    <div className="space-y-6">
      {isSim && (
        <div role="status" className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-strong">
          <strong>Modo SIMULADO.</strong> Las cuentas y cifras son inventadas y nunca salen a internet. No lo actives en producción: para pasar a la conexión real, pega la clave de la cuenta de servicio (las cuentas simuladas se ocultan, no se borran).
        </div>
      )}

      <Section title="1 · Conexión" description="Cuenta de servicio de Google Cloud añadida a la MCC con acceso de lectura (lo hace Enric en Google Ads). Los campos con * son obligatorios.">
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ads-key">Clave de la cuenta de servicio (JSON) *</Label>
            <p className="text-xs text-muted-foreground">
              Estado:{' '}
              {settings.hasCredentials ? (
                <Badge tone="success">
                  <KeyRound aria-hidden /> {settings.credentialsHint ?? 'guardada'}
                </Badge>
              ) : (
                <Badge tone="warning">sin credencial</Badge>
              )}{' '}
              {settings.credentialsAddedAt && <span>desde el {new Date(settings.credentialsAddedAt).toLocaleDateString('es-ES')}</span>}
            </p>
            <textarea
              id="ads-key"
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              rows={5}
              spellCheck={false}
              autoComplete="off"
              placeholder={'Pega aquí el archivo JSON entero, o escribe SIM para probar con datos simulados'}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveKey} disabled={pending || !keyText.trim()}>
                Guardar credencial
              </Button>
              {settings.hasCredentials && (
                <Button variant="outline" onClick={removeKey} disabled={pending}>
                  Quitar credencial
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ads-mcc">Id de la MCC *</Label>
              <Input id="ads-mcc" value={isSim ? 'MCC simulada' : mcc} onChange={(e) => setMcc(e.target.value)} placeholder="123-456-7890" disabled={isSim} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ads-dev">Token de desarrollador (opcional)</Label>
              <Input id="ads-dev" value={devToken} onChange={(e) => setDevToken(e.target.value)} placeholder={settings.hasDeveloperToken ? 'Guardado (escribe uno nuevo para cambiarlo)' : 'Solo si Google lo pide'} autoComplete="off" />
              {settings.hasDeveloperToken && (
                <button type="button" onClick={removeDevToken} className="text-xs text-muted-foreground underline" disabled={pending}>
                  Quitar el token guardado
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ads-ver">Versión de la API</Label>
                <Input id="ads-ver" value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} placeholder="v26" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ads-sunset">Fecha de retirada</Label>
                <Input id="ads-sunset" type="date" value={sunset} onChange={(e) => setSunset(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveConnection} disabled={pending}>
                Guardar conexión
              </Button>
              <Button onClick={test} disabled={pending || !settings.hasCredentials}>
                <Plug aria-hidden /> Probar conexión
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-2 border-t px-5 py-4">
          <Flash msg={credMsg} />
          <Flash msg={testMsg} />
          {!testMsg && settings.lastTest && (
            <p className="text-xs text-muted-foreground">
              Última prueba ({new Date(settings.lastTest.at).toLocaleString('es-ES')}): {settings.lastTest.ok ? 'bien' : 'falló'} — {settings.lastTest.message}
            </p>
          )}
          {testAccounts.length > 0 && (
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {testAccounts.map((a) => (
                <li key={a.customerId} className="flex items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{a.customerId}</span> {a.name} {a.status !== 'ENABLED' && <Badge tone="neutral">{a.status?.toLowerCase()}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section title="2 · Descarga" description="Lista de cuentas cada día, estructura cada día, métricas de 10 días cada 6 h (y a las 06:30), cambios cada 6 h y un latido cada hora de 07:00 a 23:00. El histórico se baja una vez, por tramos.">
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="flex items-center gap-3">
            <Switch id="ads-sync" checked={settings.syncEnabled} onCheckedChange={(v) => saveSync(v)} disabled={pending || !settings.hasCredentials} />
            <Label htmlFor="ads-sync">{settings.syncEnabled ? 'Descarga activada' : 'Descarga apagada'}</Label>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button variant="outline" onClick={syncNow} disabled={pending || !settings.syncEnabled}>
              <RefreshCw aria-hidden /> Descargar ahora
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ads-budget">Tope de operaciones al día</Label>
            <Input id="ads-budget" type="number" min={100} max={15000} value={budget} onChange={(e) => setBudget(e.target.value)} />
            <p className="text-xs text-muted-foreground">El acceso Explorer da 2.880; con 25 cuentas se gastan unas 1.200.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ads-months">Meses de histórico</Label>
            <Input id="ads-months" type="number" min={1} max={37} value={months} onChange={(e) => setMonths(e.target.value)} />
            <p className="text-xs text-muted-foreground">Google guarda 37 meses.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ads-domains">Dominios de correo de la agencia</Label>
            <Input id="ads-domains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="kijutech.com" />
            <p className="text-xs text-muted-foreground">Para saber si un cambio lo hizo la agencia o el cliente.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ads-emails">Correos de personas de la agencia con otro dominio</Label>
            <Input id="ads-emails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="persona@gmail.com" />
          </div>
          <div className="md:col-span-2">
            <Button variant="outline" onClick={() => saveSync(settings.syncEnabled)} disabled={pending}>
              Guardar descarga
            </Button>
          </div>
        </div>
        <div className="border-t px-5 py-4">
          <Flash msg={syncMsg} />
        </div>
      </Section>

      <Section title="3 · Cuentas" description="Cuentas finales de la MCC (sin sub-MCC ni cuentas de prueba). El cliente se vincula solo si su ficha tiene la cuenta en «Webs y cuentas → Google Ads»; si no, elígelo aquí. El nivel A/B/C es del cliente.">
        {accounts.length === 0 ? (
          <EmptyState className="m-5" icon={Plug} title="Aún no hay cuentas" description="Guarda la credencial y el id de la MCC, prueba la conexión y activa la descarga: la lista de cuentas llega en unos minutos." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-2 font-medium">Cuenta</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Nivel</th>
                  <th className="px-3 py-2 font-medium">Datos</th>
                  <th className="px-5 py-2 font-medium">Seguir</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b align-top">
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{a.name ?? a.customerIdLabel}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {a.customerIdLabel} {a.status && a.status !== 'ENABLED' && <Badge tone="neutral">{a.status.toLowerCase()}</Badge>} {a.simulated && <Badge tone="warning">simulada</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {a.simulated ? (
                        <span className="text-muted-foreground">No se vinculan</span>
                      ) : (
                        <>
                          <select
                            aria-label={`Cliente de ${a.name ?? a.customerIdLabel}`}
                            className="w-full max-w-56 rounded-md border bg-background px-2 py-1"
                            value={a.clientId ?? ''}
                            disabled={pending}
                            onChange={(e) =>
                              run(async () => {
                                const r = await linkAdsAccountAction(a.id, e.target.value || null);
                                setAccMsg(r.ok ? { ok: true, text: 'Vínculo guardado.' } : { ok: false, text: r.error });
                              })
                            }
                          >
                            <option value="">— Sin cliente —</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <div className="mt-1 text-xs text-muted-foreground">{a.linkedBy === 'ficha' ? 'desde la ficha' : a.linkedBy === 'manual' ? 'vinculada a mano' : ''}</div>
                          {a.linkNote && <div className="mt-1 text-xs text-warning-strong">{a.linkNote}</div>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {a.clientId ? (
                        <select
                          aria-label={`Nivel de ${a.clientName ?? 'cliente'}`}
                          className="rounded-md border bg-background px-2 py-1"
                          value={a.level ?? ''}
                          disabled={pending}
                          onChange={(e) =>
                            run(async () => {
                              const r = await setAdsClientLevelAction(a.clientId!, e.target.value || null);
                              setAccMsg(r.ok ? { ok: true, text: 'Nivel guardado.' } : { ok: false, text: r.error });
                            })
                          }
                        >
                          <option value="">—</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">vincula antes un cliente</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {a.campaigns} campañas · {a.days} días
                    </td>
                    <td className="px-5 py-2.5">
                      <Switch
                        aria-label={`Seguir ${a.name ?? a.customerIdLabel}`}
                        checked={a.tracked}
                        disabled={pending}
                        onCheckedChange={(v) =>
                          run(async () => {
                            const r = await setAdsAccountTrackedAction(a.id, v);
                            setAccMsg(r.ok ? { ok: true, text: v ? 'La cuenta se descarga desde ahora.' : 'La cuenta deja de descargarse (lo guardado se queda).' } : { ok: false, text: r.error });
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-3">
          <Flash msg={accMsg} />
        </div>
      </Section>
    </div>
  );
}
