'use client';

// Ficha del cliente → Webs y cuentas → Conexiones (27 nov 2026): WordPress (solo borradores, usuario Colaborador) y
// GoHighLevel (leads de los formularios, solo lectura). Conectar y quitar: admin. La contraseña o el token nunca vuelven
// al navegador: solo se ve el final enmascarado.
import { useState } from 'react';
import { Plug, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/page';
import type { ConnectionView } from '@/lib/core/connections';
import { connectGoHighLevelAction, connectWordPressAction, deleteConnectionAction, syncLeadsNowAction } from '@/lib/core/connection-actions';
import { MsgLine, useRun } from '../ui';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

export function Conexiones({ clientId, connections, isAdmin, canEdit }: { clientId: string; connections: ConnectionView[]; isAdmin: boolean; canEdit: boolean }) {
  const { run, pending, msg } = useRun();
  const wp = connections.find((c) => c.kind === 'wordpress');
  const ghl = connections.find((c) => c.kind === 'gohighlevel');
  const [w, setW] = useState({ url: wp?.baseUrl ?? '', user: wp?.username ?? '', pass: '' });
  const [g, setG] = useState({ loc: ghl?.externalId ?? '', token: '' });

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4" aria-labelledby="conexiones-t">
      <div>
        <h3 id="conexiones-t" className="flex items-center gap-1.5 font-semibold">
          <Plug className="size-4" />
          Conexiones
        </h3>
        <p className="text-sm text-muted-foreground">Con WordPress, SEO crea borradores desde los briefs (nunca publica). Con GoHighLevel, cuenta los leads de los formularios de su web, por página y por canal (no las llamadas ni WhatsApp). Antes de conectar, el cliente debe tener firmado el contrato de encargado del tratamiento.</p>
      </div>
      <MsgLine msg={msg} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm">WordPress</strong>
          {wp ? <Badge tone={wp.status === 'ok' ? 'success' : 'danger'}>{wp.status === 'ok' ? 'Conectado' : 'Con error'}</Badge> : <Badge tone="neutral">Sin conectar</Badge>}
          {wp && <span className="text-xs text-muted-foreground">{wp.username} · contraseña {wp.secretHint} · última comprobación {fmt(wp.lastOkAt)}</span>}
        </div>
        {wp?.lastError && <p className="text-xs text-destructive">{wp.lastError}</p>}
        {isAdmin && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_12rem_14rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => connectWordPressAction(clientId, w.url, w.user, w.pass), 'WordPress conectado.', () => setW({ ...w, pass: '' }));
            }}
          >
            <Input value={w.url} onChange={(e) => setW({ ...w, url: e.target.value })} placeholder="https://cliente.com" aria-label="Dirección de la web" required />
            <Input value={w.user} onChange={(e) => setW({ ...w, user: e.target.value })} placeholder="Usuario (rol Colaborador)" aria-label="Usuario de WordPress" required autoComplete="off" />
            <Input value={w.pass} onChange={(e) => setW({ ...w, pass: e.target.value })} type="password" placeholder={wp ? 'Contraseña (sin cambios)' : 'Contraseña de aplicación'} aria-label="Contraseña de aplicación" autoComplete="new-password" />
            <div className="flex gap-1">
              <Button type="submit" size="sm" disabled={pending}>
                {wp ? 'Comprobar y guardar' : 'Conectar'}
              </Button>
              {wp && (
                <Button type="button" size="sm" variant="ghost" aria-label="Quitar WordPress" disabled={pending} onClick={() => run(() => deleteConnectionAction(clientId, 'wordpress'), 'Quitado.')}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </form>
        )}
        {isAdmin && !wp && <p className="text-xs text-muted-foreground">En WordPress: Usuarios → Añadir nuevo con el rol «Colaborador» → en su perfil, «Contraseñas de aplicación» → crear una para «Kijutech». Se rechaza cualquier usuario que pueda publicar o subir archivos.</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm">GoHighLevel</strong>
          {ghl ? <Badge tone={ghl.status === 'ok' ? 'success' : 'danger'}>{ghl.status === 'ok' ? 'Conectado' : 'Con error'}</Badge> : <Badge tone="neutral">Sin conectar</Badge>}
          {ghl && <span className="text-xs text-muted-foreground">subcuenta {ghl.externalId} · token {ghl.secretHint} · leads descargados {fmt(ghl.lastSyncAt)}</span>}
          {ghl && canEdit && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => syncLeadsNowAction(clientId), 'Descargados.')}>
              <RefreshCw className="size-3.5" />
              Descargar ahora
            </Button>
          )}
        </div>
        {ghl?.lastError && <p className="text-xs text-destructive">{ghl.lastError}</p>}
        {isAdmin && (
          <form
            className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => connectGoHighLevelAction(clientId, g.loc, g.token), 'GoHighLevel conectado.', () => setG({ ...g, token: '' }));
            }}
          >
            <Input value={g.loc} onChange={(e) => setG({ ...g, loc: e.target.value })} placeholder="ID de la subcuenta" aria-label="ID de la subcuenta" required />
            <Input value={g.token} onChange={(e) => setG({ ...g, token: e.target.value })} type="password" placeholder={ghl ? 'Token (sin cambios)' : 'Token de integración privada (solo lectura)'} aria-label="Token" autoComplete="new-password" />
            <div className="flex gap-1">
              <Button type="submit" size="sm" disabled={pending}>
                {ghl ? 'Comprobar y guardar' : 'Conectar'}
              </Button>
              {ghl && (
                <Button type="button" size="sm" variant="ghost" aria-label="Quitar GoHighLevel" disabled={pending} onClick={() => run(() => deleteConnectionAction(clientId, 'gohighlevel'), 'Quitado.')}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </form>
        )}
        {isAdmin && !ghl && <p className="text-xs text-muted-foreground">En la subcuenta: Ajustes → Integraciones privadas → nueva, con el permiso «forms.readonly» (y nada más). El ID de la subcuenta está en Ajustes → Perfil de empresa.</p>}
      </div>
    </section>
  );
}
