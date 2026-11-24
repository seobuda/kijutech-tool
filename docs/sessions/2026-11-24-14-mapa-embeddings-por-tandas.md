# Mapa de palabras: embeddings por tandas y pasadas de seguimiento
**Fecha:** 2026-11-24  
**Rama:** fix/mapa-embeddings-por-tandas  
**Commit:** e7157eeb

## Qué se construyó
- `lib/seo/mapa/mapa.ts`: los embeddings de las búsquedas sin página clara se piden en tandas de 90 y cada tanda se guarda en `seo_text_embeddings` al llegar. Ante un límite del proveedor (429 o cuota agotada), la tanda espera un minuto y se reintenta una vez, dentro de un presupuesto de 170 s por ejecución. Si el proveedor sigue cortando, se agrupa por significado lo que ya tiene vector y por palabras el resto. Después se programa otra pasada en una hora, hasta 6 en total, con la clave `seo.mapa:<proyecto>:seguimiento:<n>`; esa pasada parte de la caché. El resultado del trabajo incluye `pendingEmbeddings`.
- `app/(dashboard)/dashboard/projects/[projectId]/palabras/page.tsx`: el panel solo tiene en cuenta los trabajos ya vencidos (`run_at <= now`), así que la pasada programada no sale como «calculando».
- `palabras-panel.tsx`: avisa de cuántas búsquedas siguen agrupadas por palabras y de que se completan solas.
- `lib/seo/salud/process-map.ts` (paso seo-palabras) y `docs/ESTADO.md` §6.39: actualizados.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Problema.** En producción, el primer mapa de CM Ibérica (23 nov, 23:48) cayó a agrupar por palabras porque Gemini devolvió 429. La capa gratuita cuenta cada texto como una petición (sin verificar: unas 100 por minuto y unas 1000 al día), y el código pedía hasta 1500 textos seguidos, todo o nada.
- **Decisión.** Se arregla dentro del módulo SEO sin tocar `embedTexts` (que es compartido): tandas, guardado incremental, uso parcial y seguimiento con un límite de pasadas.
- **Alternativas descartadas.**
  - Activar la facturación de Gemini: lo decide Enric, y no evita el problema con otros proveedores.
  - Bajar el tope de 1500: perdería cobertura.
- **Clave de seguimiento.** Cada pasada usa su número en la clave. Si usaran la misma, la pasada en curso bloquearía la siguiente, porque la deduplicación solo mira trabajos pendientes o en curso.

## Qué verificar manualmente
- Proyectos → CM Ibérica → Palabras → «Calcular el mapa». En la descripción de la tabla debe poner «por significado». Si el proveedor sigue limitando, debe decir cuántas búsquedas quedan por palabras.
- Una hora después, la pasada de seguimiento debería haber bajado ese número.

## Pendientes detectados
- Valorar activar la facturación de Gemini (los embeddings cuestan céntimos; precio sin verificar) o usar otro proveedor de embeddings para la plataforma.
