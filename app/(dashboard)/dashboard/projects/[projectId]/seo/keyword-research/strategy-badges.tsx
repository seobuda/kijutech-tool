'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DESTINATION_OPTIONS,
  CONTENT_TYPE_OPTIONS,
  SEARCH_INTENT_OPTIONS,
  findStrategyOption,
  getFixedStrategyExplanation,
  type StrategyOption,
} from '@/lib/seo/cluster-strategy-meta';

export type StrategyField = 'destination' | 'content_type' | 'search_intent';

export type StrategyValues = {
  destination: string | null;
  contentType: string | null;
  searchIntent: string | null;
};

type Props = {
  values: StrategyValues;
  strategyNote: string | null;
  onChange: (field: StrategyField, value: string) => void;
};

function BadgeSelect({
  options,
  value,
  onChange,
  label,
}: {
  options: StrategyOption[];
  value: string | null;
  onChange: (value: string) => void;
  label: string;
}) {
  const current = findStrategyOption(options, value);

  return (
    <span className="relative inline-flex">
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
          current?.className ?? 'bg-gray-200 text-gray-500'
        }`}
      >
        {current?.short ?? 'Sin definir'}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        aria-label={label}
      >
        <option value="" disabled>
          Sin definir
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.full}
          </option>
        ))}
      </select>
    </span>
  );
}

export function StrategyBadges({ values, strategyNote, onChange }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const fixedExplanation = getFixedStrategyExplanation(values.destination, values.contentType);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <BadgeSelect
        options={DESTINATION_OPTIONS}
        value={values.destination}
        onChange={(v) => onChange('destination', v)}
        label="Destino del contenido"
      />
      <BadgeSelect
        options={CONTENT_TYPE_OPTIONS}
        value={values.contentType}
        onChange={(v) => onChange('content_type', v)}
        label="Tipo de contenido"
      />
      <BadgeSelect
        options={SEARCH_INTENT_OPTIONS}
        value={values.searchIntent}
        onChange={(v) => onChange('search_intent', v)}
        label="Intención de búsqueda"
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/50 text-[10px] leading-none text-muted-foreground hover:border-foreground hover:text-foreground"
          aria-label="¿Por qué esta clasificación?"
        >
          i
        </button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Por qué esta clasificación?</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {strategyNote && <p>{strategyNote}</p>}

            {fixedExplanation && (
              <div className="space-y-1.5">
                <p className="font-medium">¿Qué significa esto?</p>
                <p className="text-muted-foreground">{fixedExplanation}</p>
              </div>
            )}

            {!strategyNote && !fixedExplanation && (
              <p className="text-muted-foreground">
                Sin información adicional para esta combinación todavía.
              </p>
            )}
          </div>

          <Button type="button" onClick={() => setModalOpen(false)} className="w-full sm:w-auto">
            Entendido
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
