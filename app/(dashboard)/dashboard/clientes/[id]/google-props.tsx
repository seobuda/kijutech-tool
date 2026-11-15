'use client';

// Propiedades de la cuenta de Google conectada (Search Console, Analytics 4, Business Profile) para la pestaña
// «Webs y cuentas» (15 nov 2026):
//   - GooglePanel: «Buscar en Google» (las que coinciden con el dominio de sus webs, sin IA) y «Comprobar accesos».
//   - GooglePicker: en el formulario, elegir la propiedad de una lista en vez de escribir el identificador.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ASSET_KIND_LABEL, type AssetKind, type ExternalAsset } from '@/lib/core/client-rules';
import { addDirectoryAssetsAction, checkClientAccessAction, listDirectoryAssetsAction, suggestClientAssetsAction } from '@/lib/core/client-actions';
import { brandBtn, checkClass, MsgLine, selectClass } from '../ui';

export const GOOGLE_KINDS: AssetKind[] = ['search_console', 'analytics', 'business_profile'];

type Msg = { type: 'ok' | 'error'; text: string } | null;
const keyOf = (x: { kind: string; value: string }) => `${x.kind}|${x.value}`;

export function GooglePanel({ clientId, hasWeb }: { clientId: string; hasWeb: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [found, setFound] = useState<ExternalAsset[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const search = () =>
    start(async () => {
      setMsg(null);
      const r = await suggestClientAssetsAction(clientId);
      if (!r.ok) return setMsg({ type: 'error', text: r.error });
      const warn = r.errors.length ? ` (${r.errors.join('; ')})` : '';
      if (!r.domains.length) return setMsg({ type: 'error', text: 'Añade antes su web: se busca por su dominio.' });
      if (!r.suggestions.length) {
        setFound(null);
        return setMsg({ type: 'ok', text: `No hay propiedades nuevas de ${r.domains.join(', ')} en la cuenta de Google conectada${warn}. Si deberían salir, pide acceso al cliente.` });
      }
      setFound(r.suggestions);
      setPicked(new Set(r.suggestions.map(keyOf)));
      if (warn) setMsg({ type: 'error', text: `Algunas no se pudieron consultar${warn}.` });
    });

  const add = () =>
    start(async () => {
      const picks = (found ?? []).filter((x) => picked.has(keyOf(x))).map((x) => ({ kind: x.kind, value: x.value }));
      const r = await addDirectoryAssetsAction(clientId, picks);
      if (!r.ok) return setMsg({ type: 'error', text: r.error });
      setFound(null);
      setMsg({ type: 'ok', text: r.added.length ? `Añadidas: ${r.added.join(' · ')}` : 'No se añadió nada (ya estaban en la ficha).' });
      router.refresh();
    });

  const check = () =>
    start(async () => {
      setMsg(null);
      const r = await checkClientAccessAction(clientId);
      if (!r.ok) return setMsg({ type: 'error', text: r.error });
      if (!r.yes.length && !r.no.length) return setMsg({ type: 'ok', text: 'No hay cuentas de Google con identificador en la ficha que comprobar.' });
      const parts = [r.yes.length ? `Con acceso: ${r.yes.length}` : '', r.no.length ? `Sin acceso: ${r.no.join(' · ')}` : '', r.errors.length ? `No comprobado: ${r.errors.join('; ')}` : ''].filter(Boolean);
      setMsg({ type: r.no.length || r.errors.length ? 'error' : 'ok', text: parts.join(' — ') });
      router.refresh();
    });

  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs" aria-labelledby="h-google">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="h-google" className="text-sm font-semibold">
            Cuentas de Google de este cliente
          </h2>
          <p className="text-xs text-muted-foreground">Search Console, Analytics y su ficha de Google, tomadas de la cuenta conectada. Los agentes usan la principal de cada tipo.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={pending || !hasWeb} onClick={search} title={hasWeb ? undefined : 'Añade antes su web'}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
            Buscar en Google
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={check}>
            <RefreshCw aria-hidden />
            Comprobar accesos
          </Button>
        </div>
      </div>
      <MsgLine msg={msg} className="mt-2" />
      {found && (
        <div className="mt-3 space-y-2" data-testid="google-sugerencias">
          <p className="text-xs text-muted-foreground">Coinciden con el dominio de su web. Marca las que son suyas:</p>
          <ul className="space-y-1">
            {found.map((x) => (
              <li key={keyOf(x)}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={cn(checkClass, 'mt-0.5')}
                    checked={picked.has(keyOf(x))}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(keyOf(x));
                        else n.delete(keyOf(x));
                        return n;
                      })
                    }
                  />
                  <span>
                    <span className="font-medium">{ASSET_KIND_LABEL[x.kind]}</span> · {x.label}
                    {x.detail && <span className="block text-xs text-muted-foreground">{x.detail}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" className={brandBtn} disabled={pending || picked.size === 0} onClick={add}>
              Añadir a la ficha
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFound(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Desplegable con las propiedades de Google de ese tipo; al elegir, rellena identificador, nombre y acceso. */
export function GooglePicker({ kind, value, onPick }: { kind: AssetKind; value: string; onPick: (x: ExternalAsset) => void }) {
  const [list, setList] = useState<ExternalAsset[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    listDirectoryAssetsAction().then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.error);
      setList(r.assets);
      if (r.errors.length) setError(r.errors.join('; '));
    });
    return () => {
      alive = false;
    };
  }, []);
  const options = (list ?? []).filter((x) => x.kind === kind);
  if (!list) return <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" aria-hidden />Consultando Google…</p>;
  if (!options.length) return <p className="text-xs text-muted-foreground">{error || `La cuenta de Google conectada no ve ninguna: ${ASSET_KIND_LABEL[kind]}. Escribe el identificador o pide acceso.`}</p>;
  return (
    <select
      className={cn(selectClass, 'w-full')}
      aria-label={`Elegir de Google: ${ASSET_KIND_LABEL[kind]}`}
      value={options.some((x) => x.value === value) ? value : ''}
      onChange={(e) => {
        const x = options.find((o) => o.value === e.target.value);
        if (x) onPick(x);
      }}
    >
      <option value="">Elegir de Google…</option>
      {options.map((x) => (
        <option key={x.value} value={x.value}>
          {x.label}
          {x.detail ? ` — ${x.detail}` : ''}
        </option>
      ))}
    </select>
  );
}
