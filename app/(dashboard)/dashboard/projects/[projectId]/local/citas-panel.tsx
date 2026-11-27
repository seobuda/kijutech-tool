'use client';

// Proyecto → Local → Citas (SEO parte 5c, 27 nov 2026): teléfonos antiguos que siguen publicados en otras webs (búsqueda
// automática cada trimestre) y los directorios de su sector para revisar a mano (sin comprobación automática: sus
// condiciones no permiten rastrearlos).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/page';
import type { CitasView } from '@/lib/seo/local/citas-view';
import { directoriesFor } from '@/lib/seo/local/citas-zonas-rules';
import { checkOldPhonesNowAction } from '@/lib/seo/local-actions';

const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

export function CitasPanel({ projectId, citas, canEdit, name, category, projectPath }: { projectId: string; citas: CitasView; canEdit: boolean; name: string; category: string | null; projectPath: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const dirs = directoriesFor(category);
  const q = `"${name}"`;

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Teléfonos antiguos publicados"
        description="Buscamos en Google, cada trimestre, los teléfonos que tuvo el negocio y ya no son el suyo. Si siguen en directorios u otras webs, quien llame no le encontrará: hay que pedir la corrección."
        actions={
          canEdit ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await checkOldPhonesNowAction(projectId);
                  setMsg(r.ok ? { type: 'ok', text: r.message ?? 'En marcha.' } : { type: 'error', text: r.error });
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Phone className="size-3.5" />}
              Buscar ahora
            </Button>
          ) : undefined
        }
      >
        {msg && (
          <p role="status" className={msg.type === 'ok' ? 'mb-2 text-sm text-success' : 'mb-2 text-sm text-destructive'}>
            {msg.text}
          </p>
        )}
        {citas.oldNap.length ? (
          <ul className="flex flex-col gap-3 text-sm">
            {citas.oldNap.map((o) => (
              <li key={o.phone}>
                <p className="font-medium">{o.phone} sigue publicado en:</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {o.urls.map((u) => (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
                        {u}
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {citas.lastRunAt ? `Última búsqueda: ${fmt(citas.lastRunAt)}. No hay teléfonos antiguos publicados que sepamos.` : 'Aún no se ha buscado.'} Los teléfonos antiguos se añaden en el{' '}
            <a href={`${projectPath}/expediente`} className="text-primary hover:underline">
              Expediente
            </a>{' '}
            («Teléfonos antiguos»); los de la ficha de Google que cambiaron se buscan solos.
          </p>
        )}
      </Section>

      <Section title="Directorios para revisar a mano" description="Los que más pesan en su sector y los generales. Comprueba que está, con el nombre, la dirección y el teléfono de su ficha de Google. Darse de alta lo hace una persona (suele pedir verificar por teléfono).">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {dirs.map((d) => (
            <li key={d.name}>
              <a href={d.search(q)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                {d.name}
                <ExternalLink className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
