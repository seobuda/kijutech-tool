import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSettings } from '@/lib/db/schema';

// Modelo de Gemini con el que se transcribe el audio de las notas. Se cambia
// en Operaciones → Ajustes (tabla ops_settings); este es solo el valor por defecto.
// gemini-2.5-flash ya no está disponible para claves nuevas (404 de Google),
// por eso el alias gemini-flash-latest, que siempre apunta al Flash vigente.
export const DEFAULT_TRANSCRIPTION_MODEL = 'gemini-flash-latest';
const TRANSCRIPTION_MODEL_KEY = 'transcription_model';

export async function getTranscriptionModel(tenantId: string): Promise<string> {
  const [row] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, TRANSCRIPTION_MODEL_KEY)))
    .limit(1);
  return row?.value?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}

export async function setTranscriptionModel(tenantId: string, model: string) {
  await db
    .insert(opsSettings)
    .values({ tenantId, key: TRANSCRIPTION_MODEL_KEY, value: model })
    .onConflictDoUpdate({
      target: [opsSettings.tenantId, opsSettings.key],
      set: { value: model, updatedAt: new Date() }
    });
}
