'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Pencil, Trash2, Copy, Plus, X } from 'lucide-react';
import {
  saveTargetKeyword,
  addKwCompetitor,
  updateKwCompetitor,
  deleteKwCompetitor,
  completeStep1,
  resetStep1
} from '@/lib/seo/kw-actions';
import { useSeoAssistantFocus } from '../../seo-assistant-context';
import type { SeoKwCompetitor } from '@/lib/db/schema';

type EditFields = { name: string; url: string; position: string };

const emptyFields: EditFields = { name: '', url: '', position: '' };

type Props = {
  projectId: string;
  initialCompetitors: SeoKwCompetitor[];
  initialTargetKeyword: string;
  initialInstructions: string | null;
  stageStatus: string;
};

export function CompetitorsPanel({
  projectId,
  initialCompetitors,
  initialTargetKeyword,
  initialInstructions,
  stageStatus
}: Props) {
  const router = useRouter();
  const setFocusedKey = useSeoAssistantFocus();

  const [targetKeyword, setTargetKeyword] = useState(initialTargetKeyword);
  const [keywordSaved, setKeywordSaved] = useState(Boolean(initialTargetKeyword));
  const [competitors, setCompetitors] = useState(initialCompetitors);
  const [newFields, setNewFields] = useState<EditFields>(emptyFields);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EditFields>(emptyFields);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [localStatus, setLocalStatus] = useState(stageStatus);
  const [isResetting, setIsResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canAddCompetitor = keywordSaved && targetKeyword.trim().length > 0;
  const canComplete = competitors.length >= 3;

  function handleSaveKeyword() {
    if (!targetKeyword.trim()) return;
    startTransition(async () => {
      await saveTargetKeyword(projectId, targetKeyword.trim());
      setKeywordSaved(true);
    });
  }

  function handleAddCompetitor() {
    if (!newFields.name.trim() || !newFields.url.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const competitor = await addKwCompetitor(projectId, {
          name: newFields.name.trim(),
          url: newFields.url.trim(),
          position: newFields.position ? parseInt(newFields.position, 10) : null
        });
        setCompetitors((prev) => [...prev, competitor]);
        setNewFields(emptyFields);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al añadir competidor');
      }
    });
  }

  function startEdit(competitor: SeoKwCompetitor) {
    setEditingId(competitor.id);
    setEditFields({
      name: competitor.name,
      url: competitor.url,
      position: competitor.position != null ? String(competitor.position) : ''
    });
  }

  function handleSaveEdit(id: string) {
    startTransition(async () => {
      await updateKwCompetitor(id, {
        name: editFields.name.trim(),
        url: editFields.url.trim(),
        position: editFields.position ? parseInt(editFields.position, 10) : null
      });
      setCompetitors((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                name: editFields.name.trim(),
                url: editFields.url.trim(),
                position: editFields.position ? parseInt(editFields.position, 10) : null
              }
            : c
        )
      );
      setEditingId(null);
    });
  }

  function handleDelete(id: string) {
    const confirmed = window.confirm('¿Eliminar este competidor?');
    if (!confirmed) return;
    startTransition(async () => {
      await deleteKwCompetitor(id);
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
    });
  }

  function handleComplete() {
    if (!canComplete) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeStep1(projectId);
        setInstructions(result.instructionsText);
        setLocalStatus('completed');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al completar el paso');
      }
    });
  }

  function handleReset() {
    const confirmed = window.confirm(
      '¿Seguro que quieres reiniciar este paso? Se borrarán todos los competidores y la keyword objetivo.'
    );
    if (!confirmed) return;
    setIsResetting(true);
    startTransition(async () => {
      await resetStep1(projectId);
      setCompetitors([]);
      setTargetKeyword('');
      setKeywordSaved(false);
      setInstructions(null);
      setLocalStatus('pending');
      router.refresh();
      setIsResetting(false);
    });
  }

  async function handleCopy() {
    if (!instructions) return;
    await navigator.clipboard.writeText(instructions);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canReset = localStatus === 'completed' || localStatus === 'in_progress';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Keyword objetivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 max-w-lg">
            <Input
              value={targetKeyword}
              onChange={(e) => {
                setTargetKeyword(e.target.value);
                setKeywordSaved(false);
              }}
              onFocus={() => setFocusedKey('target_keyword')}
              onBlur={() => setFocusedKey(null)}
              placeholder="Ej: pilates sant cugat"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveKeyword}
              disabled={isPending || !targetKeyword.trim() || keywordSaved}
            >
              {keywordSaved ? <CheckCircle2 className="h-4 w-4" /> : 'Guardar'}
            </Button>
          </div>
          {!keywordSaved && (
            <p className="text-sm text-muted-foreground mt-2">
              Guarda la keyword objetivo antes de añadir competidores.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Competidores</CardTitle>
        </CardHeader>
        <CardContent>
          {competitors.length === 0 ? (
            <p className="text-muted-foreground mb-4">
              Introduce la keyword objetivo y añade los competidores que
              aparecen en los primeros resultados de Google.
            </p>
          ) : (
            <ul className="space-y-3 mb-4">
              {competitors.map((c) => (
                <li key={c.id} className="border rounded-md p-3">
                  {editingId === c.id ? (
                    <div className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto_auto] items-center">
                      <Input
                        value={editFields.name}
                        onChange={(e) =>
                          setEditFields((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder="Nombre"
                      />
                      <Input
                        value={editFields.url}
                        onChange={(e) =>
                          setEditFields((f) => ({ ...f, url: e.target.value }))
                        }
                        placeholder="URL"
                      />
                      <Input
                        value={editFields.position}
                        onChange={(e) =>
                          setEditFields((f) => ({ ...f, position: e.target.value }))
                        }
                        placeholder="Posición"
                        type="number"
                      />
                      <Button size="sm" onClick={() => handleSaveEdit(c.id)} disabled={isPending}>
                        Guardar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {c.url}
                          {c.position != null && ` · posición ${c.position}`}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div
            className={`grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto] items-center ${
              !canAddCompetitor ? 'opacity-50' : ''
            }`}
          >
            <Input
              value={newFields.name}
              onChange={(e) => setNewFields((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del competidor"
              disabled={!canAddCompetitor}
            />
            <Input
              value={newFields.url}
              onChange={(e) => setNewFields((f) => ({ ...f, url: e.target.value }))}
              placeholder="URL"
              disabled={!canAddCompetitor}
            />
            <Input
              value={newFields.position}
              onChange={(e) =>
                setNewFields((f) => ({ ...f, position: e.target.value }))
              }
              placeholder="Posición"
              type="number"
              disabled={!canAddCompetitor}
            />
            <Button
              type="button"
              onClick={handleAddCompetitor}
              disabled={
                !canAddCompetitor ||
                isPending ||
                !newFields.name.trim() ||
                !newFields.url.trim()
              }
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </CardContent>
      </Card>

      {instructions && (
        <Card className="border-l-4 border-l-orange-400">
          <CardHeader>
            <CardTitle>Instrucciones para SE Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans bg-gray-50 rounded-md p-3">
              {instructions}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleCopy}
            >
              <Copy className="mr-2 h-4 w-4" />
              {copied ? 'Copiado' : 'Copiar instrucciones'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center space-x-3">
        <Button
          onClick={handleComplete}
          disabled={isPending || !canComplete}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {localStatus === 'completed' ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar paso como completado
            </>
          ) : (
            'Marcar paso como completado'
          )}
        </Button>
        {canReset && (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isResetting}
          >
            {isResetting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <X className="mr-2 h-4 w-4" />
                Reiniciar paso
              </>
            )}
          </Button>
        )}
      </div>
      {!canComplete && (
        <p className="text-sm text-muted-foreground">
          Necesitas al menos 3 competidores para completar este paso.
        </p>
      )}
    </div>
  );
}
