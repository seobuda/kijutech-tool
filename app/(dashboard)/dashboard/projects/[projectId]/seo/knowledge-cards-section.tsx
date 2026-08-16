import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import type { SeoKnowledgeCard } from '@/lib/db/schema';

const BORDER_BY_TYPE: Record<string, string> = {
  concept: 'border-l-blue-500',
  tip: 'border-l-green-500',
  warning: 'border-l-yellow-500',
  tutor_reminder: 'border-l-purple-500'
};

export function KnowledgeCardsSection({ cards }: { cards: SeoKnowledgeCard[] }) {
  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Sin contenido todavía — añade tarjetas desde el panel de
            administración.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {cards.map((card) => (
        <Card
          key={card.id}
          className={`border-l-4 ${BORDER_BY_TYPE[card.cardType] ?? 'border-l-gray-300'}`}
        >
          <CardContent className="pt-6">
            <p className="font-medium mb-2">{card.title}</p>
            <div className="text-sm whitespace-pre-wrap text-muted-foreground">
              {card.content}
            </div>
            {card.cardType === 'tutor_reminder' && (
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
