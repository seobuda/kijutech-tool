'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import {
  createKnowledgeCard,
  updateKnowledgeCard,
  type ActionState
} from '@/lib/seo/admin-actions';
import type { SeoKnowledgeCard } from '@/lib/db/schema';
import type { SeoManifestStage } from '@/lib/seo/manifest';

const CARD_TYPES = ['concept', 'tip', 'warning', 'tutor_reminder'] as const;

const selectClassName =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

const textareaClassName =
  'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

type KnowledgeCardFormProps = {
  stages: SeoManifestStage[];
  card?: SeoKnowledgeCard;
};

export function KnowledgeCardForm({ stages, card }: KnowledgeCardFormProps) {
  const isEditing = Boolean(card);
  const action = isEditing ? updateKnowledgeCard : createKnowledgeCard;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {}
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de la tarjeta</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={formAction}>
          {card && <input type="hidden" name="id" value={card.id} />}
          <div>
            <Label htmlFor="stageKey" className="mb-2">
              Etapa
            </Label>
            <select
              id="stageKey"
              name="stageKey"
              defaultValue={card?.stageKey ?? stages[0]?.key}
              required
              className={selectClassName}
            >
              {stages.map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="order" className="mb-2">
              Orden
            </Label>
            <Input
              id="order"
              name="order"
              type="number"
              defaultValue={card?.order ?? 0}
              required
            />
          </div>
          <div>
            <Label htmlFor="title" className="mb-2">
              Título
            </Label>
            <Input
              id="title"
              name="title"
              placeholder="Título de la tarjeta"
              defaultValue={card?.title ?? ''}
              required
            />
          </div>
          <div>
            <Label htmlFor="content" className="mb-2">
              Contenido (markdown)
            </Label>
            <textarea
              id="content"
              name="content"
              rows={8}
              placeholder="Contenido en markdown"
              defaultValue={card?.content ?? ''}
              required
              className={textareaClassName}
            />
          </div>
          <div>
            <Label htmlFor="cardType" className="mb-2">
              Tipo
            </Label>
            <select
              id="cardType"
              name="cardType"
              defaultValue={card?.cardType ?? CARD_TYPES[0]}
              required
              className={selectClassName}
            >
              {CARD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
          {state.success && (
            <p className="text-green-500 text-sm">{state.success}</p>
          )}
          <Button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : isEditing ? (
              'Guardar cambios'
            ) : (
              'Crear tarjeta'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
