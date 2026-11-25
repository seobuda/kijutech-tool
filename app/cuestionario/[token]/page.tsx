import type { Metadata } from 'next';
import { openQuestionnaire } from '@/lib/core/questions';
import { QuestionnaireForm } from './questionnaire-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cuestionario', robots: { index: false, follow: false } };

// Cuestionario en línea para el cliente (25 nov 2026). PÚBLICA, sin sesión: la protege el token del enlace (en la base
// de datos solo su hash), que caduca. Solo enseña el nombre del cliente y sus preguntas de ese cuestionario.
export default async function CuestionarioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const qn = await openQuestionnaire(token).catch(() => null);
  return (
    <main className="min-h-[100dvh] bg-muted/30 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <p className="mb-6 text-sm font-semibold tracking-tight text-brand">Kijutech</p>
        {!qn ? (
          <Notice title="Este enlace no existe" text="Revisad que esté completo. Si el problema sigue, respondednos al correo y os enviamos uno nuevo." />
        ) : qn.status === 'completado' ? (
          <Notice title="¡Gracias! Ya tenemos vuestras respuestas" text="Si queréis añadir o cambiar algo, respondednos al correo." />
        ) : qn.status !== 'activo' ? (
          <Notice title="Este enlace ya no está activo" text="Si aún queréis responder, respondednos al correo y os enviamos uno nuevo." />
        ) : (
          <QuestionnaireForm token={token} clientName={qn.clientName} expiresAt={qn.expiresAt} questions={qn.questions} />
        )}
      </div>
    </main>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted-foreground">{text}</p>
    </div>
  );
}
