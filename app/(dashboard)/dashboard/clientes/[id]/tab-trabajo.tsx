'use client';

// Pestañas «Encargos» y «SEO» de la ficha del cliente (fase 4 de la reorganización UX, 21 nov 2026): el trabajo del
// cliente dentro de su ficha, sin ir a buscarlo a Día a día o a Proyectos SEO.
import Link from 'next/link';
import { ClipboardList, ExternalLink, FolderKanban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/page';

export type RequestView = {
  id: string;
  title: string;
  assigneeName: string | null;
  dueDate: string | null;
  workStatus: string;
  syncStatus: string;
  url: string | null;
  createdAt: string;
};
export type ProjectView = { id: string; name: string; status: string; createdAt: string; linkedById: boolean };

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
const WORK: Record<string, { label: string; tone: Tone }> = {
  asignado: { label: 'Asignado', tone: 'neutral' },
  en_curso: { label: 'En curso', tone: 'info' },
  bloqueado: { label: 'Bloqueado', tone: 'danger' },
  en_revision: { label: 'En revisión', tone: 'warning' },
  devuelto: { label: 'Devuelto', tone: 'warning' },
  completado: { label: 'Completado', tone: 'success' }
};
const OPEN = ['asignado', 'en_curso', 'bloqueado', 'en_revision', 'devuelto'];
const fmtDate = (iso: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

export const openRequests = (rs: RequestView[]) => rs.filter((r) => OPEN.includes(r.workStatus)).length;

export function EncargosTab({ requests, linked }: { requests: RequestView[]; linked: boolean }) {
  const newBtn = (
    <Button asChild size="sm" className="bg-brand text-white hover:bg-brand/90">
      <Link href="/dashboard/operaciones/nuevo">
        <Plus aria-hidden /> Nuevo encargo
      </Link>
    </Button>
  );
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Este cliente todavía no tiene encargos"
        description={
          linked
            ? 'Cuando se cree un encargo para este cliente (desde el Bloc, «Nuevo encargo» o Telegram), aparecerá aquí con su estado.'
            : 'Vincula el cliente a su opción de ClickUp en la pestaña Operaciones (dentro de «Más») para que sus encargos aparezcan aquí.'
        }
        action={newBtn}
      />
    );
  }
  const open = requests.filter((r) => OPEN.includes(r.workStatus));
  const closed = requests.filter((r) => !OPEN.includes(r.workStatus));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {open.length} abierto(s) · {closed.length} completado(s), del más nuevo al más antiguo.
        </p>
        {newBtn}
      </div>
      {[
        { title: 'Abiertos', list: open },
        { title: 'Completados', list: closed.slice(0, 30) }
      ]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <section key={g.title} className="rounded-xl border bg-card shadow-xs">
            <h3 className="border-b px-4 py-2.5 text-sm font-semibold">{g.title}</h3>
            <ul className="divide-y">
              {g.list.map((r) => {
                const w = WORK[r.workStatus] ?? { label: r.workStatus, tone: 'neutral' as const };
                return (
                  <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{r.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.assigneeName ?? 'Sin asignar'}
                        {r.dueDate ? ` · entrega ${fmtDate(r.dueDate)}` : ''} · creado {fmtDate(r.createdAt)}
                        {r.syncStatus !== 'creado' && ' · aún no está en ClickUp'}
                      </span>
                    </span>
                    <Badge tone={w.tone}>{w.label}</Badge>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                        ClickUp <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      {closed.length > 30 && (
        <p className="text-xs text-muted-foreground">
          Y {closed.length - 30} completados más en <Link href="/dashboard/operaciones/encargos" className="text-brand hover:underline">Encargos</Link>.
        </p>
      )}
    </div>
  );
}

export function SeoTab({ projects, clientName }: { projects: ProjectView[]; clientName: string }) {
  const newBtn = (
    <Button asChild size="sm" variant="outline">
      <Link href={`/dashboard/projects/new?cliente=${encodeURIComponent(clientName)}`}>
        <Plus aria-hidden /> Nuevo proyecto SEO
      </Link>
    </Button>
  );
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Sin proyectos SEO"
        description="Los proyectos SEO (keyword research, clusters, auditoría…) de este cliente aparecerán aquí. Se reconocen por el cliente indicado al crearlos."
        action={newBtn}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">{newBtn}</div>
      <ul className="divide-y rounded-xl border bg-card shadow-xs">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/dashboard/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent">
              <FolderKanban className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">Creado {fmtDate(p.createdAt)}</span>
              </span>
              {p.status !== 'active' && <Badge>{p.status}</Badge>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
