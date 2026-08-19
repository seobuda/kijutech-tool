'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Check, FlaskConical } from 'lucide-react';
import { saveAiPrompt } from '@/lib/ai/actions';
import { testAiPrompt } from '@/lib/seo/kw-ai-actions';

const textareaClassName =
  'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

const selectClassName =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

type PromptData = {
  key: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  isActive: boolean;
  version: number;
  updatedAt: Date;
  updatedByLabel: string;
};

type Props = {
  prompt: PromptData;
  projects: { id: string; name: string }[];
};

type TestResult = {
  rawResponse: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number | null;
  provider: string;
  model: string;
};

export function PromptEditForm({ prompt, projects }: Props) {
  const router = useRouter();
  const [name, setName] = useState(prompt.name);
  const [description, setDescription] = useState(prompt.description);
  const [systemPrompt, setSystemPrompt] = useState(prompt.systemPrompt);
  const [userPromptTemplate, setUserPromptTemplate] = useState(prompt.userPromptTemplate);
  const [isActive, setIsActive] = useState(prompt.isActive);

  const [isSaving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [testProjectId, setTestProjectId] = useState(projects[0]?.id ?? '');
  const [isTesting, startTesting] = useTransition();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  function handleSave() {
    setSaveError(null);
    setSaved(false);
    startSaving(async () => {
      const result = await saveAiPrompt(prompt.key, {
        name,
        description,
        systemPrompt,
        userPromptTemplate,
        isActive,
      });
      if ('error' in result) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function handleTest() {
    if (!testProjectId) return;
    setTestError(null);
    setTestResult(null);
    startTesting(async () => {
      const result = await testAiPrompt(testProjectId, { systemPrompt, userPromptTemplate });
      if ('error' in result) {
        setTestError(result.error);
        return;
      }
      setTestResult(result);
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Descripción</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>System Prompt</Label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className={textareaClassName}
          style={{ minHeight: 200 }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>User Prompt Template</Label>
        <textarea
          value={userPromptTemplate}
          onChange={(e) => setUserPromptTemplate(e.target.value)}
          className={textareaClassName}
          style={{ minHeight: 300 }}
        />
        <p className="text-xs text-muted-foreground">
          Variables disponibles: <code>{'{count}'}</code> (número de keywords),{' '}
          <code>{'{keywords_list}'}</code> (lista formateada)
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <Label>{isActive ? 'Activo' : 'Inactivo'}</Label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Probar prompt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ejecuta una llamada real con las keywords de un proyecto. No guarda nada en
            los clusters del proyecto.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={testProjectId}
              onChange={(e) => setTestProjectId(e.target.value)}
              className={`${selectClassName} max-w-xs`}
            >
              {projects.length === 0 && <option value="">Sin proyectos</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isTesting || !testProjectId}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Ejecutar prueba'
              )}
            </Button>
          </div>

          {testError && <p className="text-sm text-red-600">{testError}</p>}

          {testResult && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {testResult.provider} · {testResult.model} · {testResult.inputTokens}+
                {testResult.outputTokens} tokens
                {testResult.estimatedCost != null &&
                  ` · ~${testResult.estimatedCost.toFixed(4)}€`}
              </p>
              <pre className="text-xs whitespace-pre-wrap bg-gray-50 rounded-md p-3 max-h-96 overflow-y-auto">
                {testResult.rawResponse}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Versión actual: {prompt.version} · Última edición:{' '}
        {new Date(prompt.updatedAt).toLocaleString('es-ES')} por {prompt.updatedByLabel}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="mr-2 h-4 w-4" />
          ) : null}
          Guardar cambios
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/ai/settings')}>
          Cancelar
        </Button>
      </div>
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
    </div>
  );
}
