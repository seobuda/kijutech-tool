import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader, Section } from '@/components/ui/page';
import { GuideButton } from './guide-button';
import { GLOSSARY } from './glossary';

export const dynamic = 'force-dynamic';

// Ayuda y glosario (fase 5 UX, 21 nov 2026): un nombre por concepto y qué significa, para que nadie tenga que preguntar
// qué es un «bloqueo» o una «revisión». Desde aquí también se vuelve a ver la guía.
export default async function AyudaPage() {
  await requirePagePermission('view');
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={CircleHelp}
        title="Ayuda y glosario"
        description="Qué significa cada término de la herramienta, en una frase. Para aprender a hacer algo concreto, busca en Conocimiento o pregúntale al jefe de operaciones por Telegram."
        actions={<GuideButton />}
      />
      {GLOSSARY.map((g) => (
        <Section key={g.group} title={g.group}>
          <dl className="divide-y">
            {g.terms.map((t) => (
              <div key={t.term} id={t.term.toLowerCase().replace(/\s+/g, '-')} className="grid gap-1 px-5 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
                <dt className="font-medium">
                  {t.href ? (
                    <Link href={t.href} className="hover:underline">
                      {t.term}
                    </Link>
                  ) : (
                    t.term
                  )}
                </dt>
                <dd className="text-sm text-muted-foreground text-pretty">{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}
    </PageContainer>
  );
}
