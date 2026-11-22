'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { toggleAiPrompt } from '@/lib/ai/actions';
import { Badge } from '@/components/ui/page';

type PromptRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
  updatedByEmail: string | null;
};

// Estado del examen de cada prompt que tiene batería (22 nov 2026): se ve en la lista sin tener que entrar.
type ExamState = 'sin-examen' | 'sin-examinar' | 'aprobado' | 'suspendido' | 'en-curso' | 'error';
const EXAM: Record<ExamState, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
  'sin-examen': { label: 'Examen: nunca pasado', tone: 'warning' },
  'sin-examinar': { label: 'Examen: cambiado sin examinar', tone: 'warning' },
  aprobado: { label: 'Examen: aprobado', tone: 'success' },
  suspendido: { label: 'Examen: suspendido', tone: 'danger' },
  'en-curso': { label: 'Examinando…', tone: 'info' },
  error: { label: 'Examen: no terminó', tone: 'danger' }
};

export function PromptsSection({ prompts, exams = {} }: { prompts: PromptRow[]; exams?: Record<string, ExamState> }) {
  if (prompts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            No hay prompts registrados todavía. Se siembran al aplicar la migración
            del módulo de IA (`cluster_keywords`).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {prompts.map((prompt) => (
        <PromptRow key={prompt.id} prompt={prompt} exam={exams[prompt.key] ?? null} />
      ))}
    </div>
  );
}

function PromptRow({ prompt, exam }: { prompt: PromptRow; exam: ExamState | null }) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(prompt.isActive);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(checked: boolean) {
    setIsActive(checked);
    setError(null);
    startTransition(async () => {
      const result = await toggleAiPrompt(prompt.key, checked);
      if ('error' in result) {
        setError(result.error);
        setIsActive(!checked);
        return;
      }
      router.refresh();
    });
  }

  const updaterLabel = prompt.updatedByName ?? prompt.updatedByEmail ?? '—';

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium flex flex-wrap items-center gap-2">
              {prompt.name}
              {exam && (
                <Badge tone={EXAM[exam].tone} dot>
                  {EXAM[exam].label}
                </Badge>
              )}
            </p>
            {prompt.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{prompt.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              key: <code>{prompt.key}</code> · versión {prompt.version}
            </p>
          </div>
          <Link href={`/dashboard/ai/settings/prompts/${prompt.key}`}>
            <Button type="button" variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={handleToggle} disabled={isPending} />
            <span className="text-sm">{isActive ? 'Activo' : 'Inactivo'}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Última actualización: {new Date(prompt.updatedAt).toLocaleString('es-ES')} por{' '}
            {updaterLabel}
          </p>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </CardContent>
    </Card>
  );
}
