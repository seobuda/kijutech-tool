'use client';

// Formulario de proyecto (cimientos, 23 nov 2026): el cliente es obligatorio y el alcance (webs, Search Console, fichas
// de Google, redes…) se elige de entre las cuentas de ese cliente. Un cliente puede tener varios proyectos.
import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { createProject, updateProject } from '@/lib/projects/actions';
import type { Project } from '@/lib/db/schema';
import type { PickerClient } from '@/lib/projects/scope';

type ActionState = {
  error?: string;
  success?: string;
};

type Props = {
  project?: Project;
  clients: PickerClient[];
  /** Cuentas ya en el alcance (al editar). */
  scope?: string[];
  /** Cliente ya elegido al crear (desde la ficha del cliente): id o nombre. */
  defaultClient?: string;
};

const SERVICES = [
  { value: 'seo', label: 'SEO (posicionamiento orgánico)' },
  { value: 'ads', label: 'Google Ads' },
  { value: 'web', label: 'Web' },
  { value: 'otro', label: 'Otro' }
];

const KIND_LABEL: Record<string, string> = {
  web: 'Web',
  dominio: 'Dominio',
  search_console: 'Search Console',
  analytics: 'Analytics',
  business_profile: 'Ficha de Google',
  google_ads: 'Google Ads',
  meta: 'Meta',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tienda: 'Tienda',
  crm: 'CRM',
  mapa_contenido: 'Mapa de contenido',
  otro: 'Otra'
};

const selectClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function ProjectForm({ project, clients, scope, defaultClient }: Props) {
  const isEditing = Boolean(project);
  const action = isEditing ? updateProject : createProject;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, {});
  const initialClient =
    project?.clientId ??
    clients.find((c) => c.id === defaultClient)?.id ??
    clients.find((c) => c.name.toLowerCase() === (defaultClient ?? '').toLowerCase())?.id ??
    '';
  const [clientId, setClientId] = useState(initialClient);
  const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(scope ?? []));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const validPicked = client ? [...picked].filter((id) => client.assets.some((a) => a.id === id)) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del proyecto</CardTitle>
        <p className="text-sm text-muted-foreground">
          Los campos con <span className="text-destructive">*</span> son obligatorios.
        </p>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" action={formAction}>
          {project && <input type="hidden" name="id" value={project.id} />}
          <input type="hidden" name="assets" value={validPicked.join(',')} />
          <div>
            <Label htmlFor="clientId" className="mb-2">
              Cliente <span className="text-destructive">*</span>
            </Label>
            <select
              id="clientId"
              name="clientId"
              required
              className={selectClass}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setPicked(new Set());
              }}
            >
              <option value="">Elige el cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No hay clientes todavía.{' '}
                <Link href="/dashboard/clientes" className="text-brand underline-offset-2 hover:underline">
                  Crea uno primero
                </Link>
                .
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="name" className="mb-2">
              Nombre del proyecto <span className="text-destructive">*</span>
            </Label>
            <Input id="name" name="name" placeholder="Ej.: SEO web principal · Implantes Bilbao" defaultValue={project?.name ?? ''} required />
            <p className="mt-1 text-xs text-muted-foreground">Un cliente puede tener varios proyectos: otra web, otra línea de negocio u otra ciudad.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="service" className="mb-2">
                Servicio
              </Label>
              <select id="service" name="service" className={selectClass} defaultValue={project?.service ?? 'seo'}>
                {SERVICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="monthlyHours" className="mb-2">
                Horas al mes
              </Label>
              <Input id="monthlyHours" name="monthlyHours" type="number" min={0} max={1000} step={0.5} placeholder="Si se deja vacío, las del cliente" defaultValue={project?.monthlyHours ?? ''} />
            </div>
          </div>
          <div>
            <Label htmlFor="location" className="mb-2">
              Zona objetivo
            </Label>
            <Input id="location" name="location" placeholder="Ej.: Bilbao y Gran Bilbao" defaultValue={project?.location ?? ''} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Alcance del proyecto</legend>
            {!client ? (
              <p className="text-xs text-muted-foreground">Elige primero el cliente para ver sus webs y cuentas.</p>
            ) : client.assets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {client.name} no tiene webs ni cuentas en su ficha.{' '}
                <Link href={`/dashboard/clientes/${client.id}?tab=webs`} className="text-brand underline-offset-2 hover:underline">
                  Añádelas en «Webs y cuentas»
                </Link>{' '}
                y vuelve aquí (el proyecto se puede guardar sin alcance y completarlo después).
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Marca las webs, propiedades de Google, fichas y redes que trabaja este proyecto.</p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {client.assets.map((a) => (
                    <li key={a.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
                        <span className="min-w-0">
                          <span className="font-medium">{KIND_LABEL[a.kind] ?? a.kind}</span>
                          <span className="block truncate text-xs text-muted-foreground">{a.label || a.value}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </fieldset>
          {state.error && <p className="text-destructive text-sm" role="alert">{state.error}</p>}
          {state.success && <p className="text-success text-sm">{state.success}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="bg-brand hover:bg-brand/90 text-white" disabled={isPending || !clientId}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Guardando...' : 'Creando...'}
                </>
              ) : isEditing ? (
                'Guardar cambios'
              ) : (
                'Crear proyecto'
              )}
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard/projects">Cancelar</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
