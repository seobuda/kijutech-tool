'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { SeoKnowledgeCard } from '@/lib/db/schema';

const CARD_STYLE_BY_TYPE: Record<string, { border: string; bg: string }> = {
  concept: { border: 'border-blue-400', bg: 'bg-blue-50' },
  tip: { border: 'border-green-400', bg: 'bg-green-50' },
  warning: { border: 'border-yellow-400', bg: 'bg-yellow-50' },
  tutor_reminder: { border: 'border-purple-400', bg: 'bg-purple-50' }
};

const DEFAULT_STYLE = { border: 'border-gray-300', bg: 'bg-gray-50' };

type Props = {
  cards: SeoKnowledgeCard[];
  focusedKey: string | null;
};

export function SeoAssistantPanel({ cards, focusedKey }: Props) {
  const genericCards = useMemo(
    () => cards.filter((c) => !c.contextKey),
    [cards]
  );
  const [carouselIndex, setCarouselIndex] = useState(0);

  useEffect(() => {
    if (carouselIndex >= genericCards.length) {
      setCarouselIndex(0);
    }
  }, [genericCards.length, carouselIndex]);

  const contextualCard = focusedKey
    ? (cards.find((c) => c.contextKey === focusedKey) ?? null)
    : null;

  const activeCard = contextualCard ?? genericCards[carouselIndex] ?? null;

  const [displayedCard, setDisplayedCard] = useState(activeCard);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (activeCard?.id === displayedCard?.id) {
      return;
    }
    setOpacity(0);
    const timeout = setTimeout(() => {
      setDisplayedCard(activeCard);
      setOpacity(1);
    }, 150);
    return () => clearTimeout(timeout);
  }, [activeCard, displayedCard]);

  const style = displayedCard
    ? (CARD_STYLE_BY_TYPE[displayedCard.cardType] ?? DEFAULT_STYLE)
    : DEFAULT_STYLE;

  const showCarouselControls = !contextualCard && genericCards.length > 1;

  return (
    <div className="flex flex-col items-center lg:sticky lg:top-6">
      <div className="text-5xl leading-none mb-2" aria-hidden="true">
        🤖
      </div>
      <p className="text-sm font-medium text-muted-foreground mb-4">
        Asistente Kijutech
      </p>

      <div className="relative w-full max-w-sm">
        <div
          className={`absolute -top-2 left-8 h-4 w-4 rotate-45 border-t-2 border-l-2 ${style.border} ${style.bg}`}
          aria-hidden="true"
        />
        <div
          className={`relative rounded-lg border-2 p-4 transition-opacity duration-150 ${style.border} ${style.bg}`}
          style={{ opacity }}
        >
          {displayedCard ? (
            <>
              <p className="font-medium mb-2">{displayedCard.title}</p>
              <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                {displayedCard.content}
              </div>
              {displayedCard.cardType === 'tutor_reminder' && (
                <a
                  href="https://claude.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="mt-3">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir Tutor Claude
                  </Button>
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin contenido todavía.
            </p>
          )}
        </div>

        {showCarouselControls && (
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              type="button"
              onClick={() =>
                setCarouselIndex(
                  (i) => (i - 1 + genericCards.length) % genericCards.length
                )
              }
              className="text-muted-foreground hover:text-foreground"
              aria-label="Tarjeta anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground">
              {carouselIndex + 1} / {genericCards.length}
            </span>
            <button
              type="button"
              onClick={() =>
                setCarouselIndex((i) => (i + 1) % genericCards.length)
              }
              className="text-muted-foreground hover:text-foreground"
              aria-label="Siguiente tarjeta"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
