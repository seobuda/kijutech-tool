'use client';

import { useState, useTransition } from 'react';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { saveAuditFindings, markStageComplete } from '@/lib/seo/actions';
import { seoProgressSwrKey } from '@/lib/seo/client-keys';
import {
  AUDIT_CHECKPOINTS,
  AUDIT_AREA_LABELS,
  formatCheckPointLabel
} from '@/lib/seo/audit-checkpoints';
import { useSeoAssistantFocus } from '../seo-assistant-context';
import type { SeoAuditFinding } from '@/lib/db/schema';

const STATUS_OPTIONS = ['bien', 'mejorable', 'critico'] as const;
const PRIORITY_OPTIONS = ['alta', 'media', 'baja'] as const;

const selectClassName =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

const textareaClassName =
  'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

type RowState = {
  status: string;
  finding: string;
  priority: string;
  recommendedAction: string;
};

function rowKey(area: string, checkPoint: string) {
  return `${area}:${checkPoint}`;
}

type Props = {
  projectId: string;
  existingFindings: SeoAuditFinding[];
};

export function AuditForm({ projectId, existingFindings }: Props) {
  const setFocusedKey = useSeoAssistantFocus();
  const existingMap = new Map(
    existingFindings.map((f) => [rowKey(f.area, f.checkPoint), f])
  );

  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    for (const [area, checkpoints] of Object.entries(AUDIT_CHECKPOINTS)) {
      for (const cp of checkpoints) {
        const existing = existingMap.get(rowKey(area, cp));
        initial[rowKey(area, cp)] = {
          status: existing?.status ?? '',
          finding: existing?.finding ?? '',
          priority: existing?.priority ?? '',
          recommendedAction: existing?.recommendedAction ?? ''
        };
      }
    }
    return initial;
  });

  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(false);

  function updateRow(
    area: string,
    checkPoint: string,
    field: keyof RowState,
    value: string
  ) {
    const key = rowKey(area, checkPoint);
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function handleSave() {
    startTransition(async () => {
      const findings = Object.entries(AUDIT_CHECKPOINTS).flatMap(
        ([area, checkpoints]) =>
          checkpoints.map((cp) => {
            const row = rows[rowKey(area, cp)];
            return {
              area,
              checkPoint: cp,
              status: row.status || null,
              finding: row.finding || null,
              priority: row.priority || null,
              recommendedAction: row.recommendedAction || null
            };
          })
      );
      await saveAuditFindings(projectId, findings);
      setSaved(true);
    });
  }

  function handleComplete() {
    startTransition(async () => {
      await markStageComplete(projectId, 'audit');
      mutate(seoProgressSwrKey(projectId));
      setCompleted(true);
    });
  }

  return (
    <div className="space-y-6">
      {Object.entries(AUDIT_CHECKPOINTS).map(([area, checkpoints]) => (
        <Card key={area}>
          <CardHeader>
            <CardTitle>{AUDIT_AREA_LABELS[area]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {checkpoints.map((cp) => {
              const key = rowKey(area, cp);
              const row = rows[key];
              return (
                <div
                  key={key}
                  className="border-t border-gray-200 pt-4 first:border-t-0 first:pt-0 space-y-3"
                >
                  <p className="font-medium text-sm">
                    {formatCheckPointLabel(cp)}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="mb-2">Estado</Label>
                      <select
                        value={row.status}
                        onChange={(e) =>
                          updateRow(area, cp, 'status', e.target.value)
                        }
                        onFocus={() => setFocusedKey(cp)}
                        onBlur={() => setFocusedKey(null)}
                        className={selectClassName}
                      >
                        <option value="">Sin revisar</option>
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="mb-2">Prioridad</Label>
                      <select
                        value={row.priority}
                        onChange={(e) =>
                          updateRow(area, cp, 'priority', e.target.value)
                        }
                        onFocus={() => setFocusedKey(cp)}
                        onBlur={() => setFocusedKey(null)}
                        className={selectClassName}
                      >
                        <option value="">—</option>
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2">Hallazgo</Label>
                    <textarea
                      value={row.finding}
                      onChange={(e) =>
                        updateRow(area, cp, 'finding', e.target.value)
                      }
                      onFocus={() => setFocusedKey(cp)}
                      onBlur={() => setFocusedKey(null)}
                      rows={2}
                      className={textareaClassName}
                    />
                  </div>
                  <div>
                    <Label className="mb-2">Acción recomendada</Label>
                    <textarea
                      value={row.recommendedAction}
                      onChange={(e) =>
                        updateRow(area, cp, 'recommendedAction', e.target.value)
                      }
                      onFocus={() => setFocusedKey(cp)}
                      onBlur={() => setFocusedKey(null)}
                      rows={2}
                      className={textareaClassName}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center space-x-3">
        <Button onClick={handleSave} disabled={isPending} variant="outline">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar radiografía
        </Button>
        <Button
          onClick={handleComplete}
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {completed ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Etapa completada
            </>
          ) : (
            'Marcar etapa como completada'
          )}
        </Button>
      </div>
      {saved && <p className="text-green-500 text-sm">Radiografía guardada.</p>}
    </div>
  );
}
