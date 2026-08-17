'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' }
];

const selectClassName =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

const textareaClassName =
  'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

export type ClusterFormValues = {
  title: string;
  targetUrl: string;
  difficulty: string;
  priority: string;
  notes: string;
  clientNote: string;
};

type Props = {
  initialValues?: Partial<ClusterFormValues>;
  onSubmit: (values: ClusterFormValues) => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
};

export function ClusterForm({
  initialValues,
  onSubmit,
  onCancel,
  isPending,
  submitLabel
}: Props) {
  const [values, setValues] = useState<ClusterFormValues>({
    title: initialValues?.title ?? '',
    targetUrl: initialValues?.targetUrl ?? '',
    difficulty: initialValues?.difficulty ?? '',
    priority: initialValues?.priority ?? '0',
    notes: initialValues?.notes ?? '',
    clientNote: initialValues?.clientNote ?? ''
  });

  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1">Título</Label>
        <Input
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder="Título del cluster"
        />
      </div>
      <div>
        <Label className="mb-1">URL destino (opcional)</Label>
        <Input
          value={values.targetUrl}
          onChange={(e) => setValues((v) => ({ ...v, targetUrl: e.target.value }))}
          placeholder="/pilates-sant-cugat"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Slug en español sin acentos, ejemplo: /pilates-sant-cugat
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1">Dificultad</Label>
          <select
            value={values.difficulty}
            onChange={(e) => setValues((v) => ({ ...v, difficulty: e.target.value }))}
            className={selectClassName}
          >
            <option value="">—</option>
            {DIFFICULTY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="mb-1">Prioridad</Label>
          <Input
            type="number"
            value={values.priority}
            onChange={(e) => setValues((v) => ({ ...v, priority: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <Label className="mb-1">Notas internas</Label>
        <textarea
          value={values.notes}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
          rows={3}
          className={textareaClassName}
        />
      </div>
      <div>
        <Label className="mb-1">Nota para el cliente</Label>
        <textarea
          value={values.clientNote}
          onChange={(e) => setValues((v) => ({ ...v, clientNote: e.target.value }))}
          rows={2}
          className={textareaClassName}
        />
      </div>
      <div className="flex items-center space-x-2">
        <Button
          type="button"
          onClick={() => onSubmit(values)}
          disabled={isPending || !values.title.trim()}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
