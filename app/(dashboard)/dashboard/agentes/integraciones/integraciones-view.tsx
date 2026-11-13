'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Section } from '@/components/ui/page';
import { deleteIntegrationAction, saveIntegrationAction } from '@/lib/agentes/actions';

export type ProviderView = {
  key: string;
  title: string;
  what: string;
  howTo: string;
  fields: { key: string; label: string; secret: boolean; placeholder?: string }[];
  status: string | null;
  lastError: string | null;
  lastOkAt: string | null;
  values: Record<string, string>;
  hasSecrets: Record<string, boolean>;
  authorized: boolean | null;
};

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  conectada: { label: 'Conectada', tone: 'success' },
  pendiente: { label: 'Falta autorizar', tone: 'warning' },
  error: { label: 'Con error', tone: 'danger' }
};

export function IntegracionesView({ providers, redirectUri, googleMessage }: { providers: ProviderView[]; redirectUri: string; googleMessage: string | null }) {
  return (
    <div className="space-y-4">
      {googleMessage && (
        <p role="status" className="rounded-lg border bg-card px-4 py-3 text-sm">
          {googleMessage}
        </p>
      )}
      <p className="text-sm text-muted-foreground text-pretty">
        Cada integración da herramientas nuevas a los agentes (márcalas en la ficha del agente). Las credenciales se guardan cifradas y no se vuelven a enseñar;
        para cambiarlas, escribe las nuevas. Próximamente: más proveedores según los vayas necesitando.
      </p>
      {providers.map((p) => (
        <ProviderCard key={p.key} p={p} redirectUri={redirectUri} />
      ))}
    </div>
  );
}

function ProviderCard({ p, redirectUri }: { p: ProviderView; redirectUri: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(p.values);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const st = p.status ? STATUS[p.status] : null;
  const save = () =>
    start(async () => {
      const r = await saveIntegrationAction(p.key, values);
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) setValues(Object.fromEntries(Object.entries(values).filter(([k]) => !p.fields.find((f) => f.key === k)?.secret)));
      router.refresh();
    });
  const remove = () => {
    if (!window.confirm(`¿Quitar ${p.title}? Los agentes dejarán de poder usarla.`)) return;
    start(async () => {
      await deleteIntegrationAction(p.key);
      router.refresh();
    });
  };
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" aria-hidden /> {p.title} {st && <Badge tone={st.tone}>{st.label}</Badge>}
        </span>
      }
      description={p.what}
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        <p className="text-muted-foreground">{p.howTo}</p>
        {p.key === 'google' && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs">
            URI de redirección autorizada: <code className="select-all">{redirectUri}</code>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {p.fields.map((f) => (
            <label key={f.key}>
              <span className="mb-1 block font-medium">{f.label}</span>
              <Input
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={values[f.key] ?? ''}
                placeholder={f.secret && p.hasSecrets[f.key] ? '•••••• (guardado; escribe para cambiarlo)' : (f.placeholder ?? '')}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {p.lastError && <p className="text-destructive">Último error: {p.lastError}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={pending}>
            Guardar
          </Button>
          {p.key === 'google' && p.status && (
            <Button size="sm" variant="outline" asChild>
              <a href="/api/agentes/google/conectar">{p.authorized ? 'Volver a conectar con Google' : 'Conectar con Google'}</a>
            </Button>
          )}
          {p.status && (
            <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
              Quitar
            </Button>
          )}
          {msg && (
            <p role="status" className={msg.ok ? 'text-success' : 'text-destructive'}>
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}
