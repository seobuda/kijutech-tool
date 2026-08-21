'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Loader2 } from 'lucide-react';
import { updateManualQuestions, generateContentPlan } from '@/lib/seo/content-plan-actions';
import type { ArticleIdea, ContentPlanAnalysis } from '@/lib/seo/content-plan-actions';
import type { SeoClusterContentPlan } from '@/lib/db/schema';

const PRIORITY_META: Record<string, { emoji: string; cardClass: string; badgeClass: string; label: string }> = {
  alta: { emoji: '🔴', cardClass: 'border-2 border-red-300 bg-red-50/40', badgeClass: 'bg-red-100 text-red-700', label: 'Alta' },
  media: { emoji: '🟡', cardClass: 'border border-amber-300 bg-amber-50/40', badgeClass: 'bg-amber-100 text-amber-700', label: 'Media' },
  baja: { emoji: '🟢', cardClass: 'border border-green-300 bg-green-50/40', badgeClass: 'bg-green-100 text-green-700', label: 'Baja' },
};

const SOURCE_LABEL: Record<string, string> = {
  keyword_existente: 'Keyword existente',
  pregunta_google: 'Pregunta de Google',
  gap_competidor: 'Gap de competidor',
  // No pretende venir de un dato concreto — es la etiqueta de corrección
  // que aplica correctSourceAttribution() en content-plan-actions.ts
  // cuando el modelo atribuye una idea a una fuente sin datos reales.
  sugerencia_ia: 'Sugerencia de la IA',
};

// analysis_json guarda o bien el plan parseado, o bien { error: "..." }
// cuando el parseo de la respuesta de la IA falló (generateContentPlan en
// lib/seo/content-plan-actions.ts) — mismo patrón que competitors-panel.tsx.
function isValidAnalysis(json: unknown): json is ContentPlanAnalysis {
  return (
    typeof json === 'object' && json !== null && Array.isArray((json as Record<string, unknown>).article_ideas)
  );
}

function isAnalysisError(json: unknown): json is { error: string } {
  return typeof json === 'object' && json !== null && typeof (json as Record<string, unknown>).error === 'string';
}

function ArticleIdeaCard({ idea }: { idea: ArticleIdea }) {
  const meta = PRIORITY_META[idea.priority] ?? PRIORITY_META.media;
  return (
    <Card className={meta.cardClass}>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>{meta.emoji}</span>
            <span className="font-semibold">{idea.title}</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${meta.badgeClass}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Responde: <span className="italic">{idea.target_question}</span>
          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">
            {SOURCE_LABEL[idea.source] ?? idea.source}
          </span>
        </p>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qué es</p>
          <p className="text-sm">{idea.what}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Por qué importa</p>
          <p className="text-sm">{idea.why}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cómo ejecutarlo</p>
          <p className="text-sm">{idea.how}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function GenerationLoading() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Generando ideas de contenido... esto puede tardar unos segundos.
        </p>
        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

type Props = {
  clusterId: string;
  initialPlan: SeoClusterContentPlan | null;
};

export function ContentPlanPanel({ clusterId, initialPlan }: Props) {
  const [plan, setPlan] = useState(initialPlan);
  const [questionsText, setQuestionsText] = useState(((initialPlan?.manualQuestions as string[] | null) ?? []).join('\n'));
  const [questionsSaved, setQuestionsSaved] = useState(true);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isSavingQuestions, startSavingQuestions] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  function handleSaveQuestions() {
    startSavingQuestions(async () => {
      const updated = await updateManualQuestions(clusterId, questionsText);
      setPlan(updated);
      setQuestionsSaved(true);
    });
  }

  function handleGenerate() {
    setGenerationError(null);
    startGenerating(async () => {
      const result = await generateContentPlan(clusterId);
      if ('error' in result) {
        setGenerationError(result.error);
        return;
      }
      setPlan(result.plan);
      // Refleja server-side lo que ya haya en manual_questions (por si el
      // usuario generó sin pasar antes por "Guardar preguntas").
      setQuestionsText(((result.plan.manualQuestions as string[] | null) ?? []).join('\n'));
      setQuestionsSaved(true);
    });
  }

  const analysis = plan?.analysisJson ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div>
            <p className="text-sm font-medium">Preguntas de Google</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pega aquí una pregunta por línea — búscalas en Google escribiendo tu keyword principal
              y mirando la sección &ldquo;La gente también pregunta&rdquo; y &ldquo;Búsquedas
              relacionadas&rdquo; al final de la página de resultados.
            </p>
          </div>
          <textarea
            value={questionsText}
            onChange={(e) => {
              setQuestionsText(e.target.value);
              setQuestionsSaved(false);
            }}
            rows={5}
            placeholder={'¿Cuánto cuesta...?\n¿Qué diferencia hay entre...?'}
            className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveQuestions}
            disabled={isSavingQuestions || questionsSaved}
          >
            {isSavingQuestions ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar preguntas'}
          </Button>
        </CardContent>
      </Card>

      {!isGenerating && (
        <Button
          type="button"
          onClick={handleGenerate}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Generar ideas de contenido con IA
        </Button>
      )}

      {isGenerating ? (
        <GenerationLoading />
      ) : isValidAnalysis(analysis) ? (
        <div className="space-y-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm">{analysis.summary}</p>
              {plan?.updatedAt && (
                <div className="flex items-center justify-between gap-3 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Generado el {new Date(plan.updatedAt).toLocaleDateString('es-ES')}
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                    Regenerar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="space-y-3">
            {analysis.article_ideas.map((idea, i) => (
              <ArticleIdeaCard key={i} idea={idea} />
            ))}
          </div>
        </div>
      ) : generationError || isAnalysisError(analysis) ? (
        <Card className="border-red-300 bg-red-50/40">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-red-700">
              {generationError ?? (isAnalysisError(analysis) ? analysis.error : '')}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={handleGenerate} disabled={isGenerating}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Añade preguntas de Google (opcional) y pulsa generar. También usaremos las keywords
          informacionales del proyecto y el análisis de competidores si ya existe.
        </p>
      )}
    </div>
  );
}
