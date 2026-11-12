# Fichas de clientes desde el historial, prueba de restauración y lista de pendientes
**Fecha:** 2026-11-13  
**Rama:** feature/autonomia-2  
**Commit:** c8e9a919

## Qué se construyó
- **Despliegue previo:** `feature/autonomia` fusionada en `main` (`0850e320`) y desplegada sin migraciones. Comprobado: web 200, Telegram sin errores y 0 errores en logs.
- `docs/PENDIENTES-ENRIC.md` (nuevo): lista viva de lo que solo puede hacer Enric.
  - Viernes antes de activar, activación, fin de semana y lunes.
  - Decisiones que esperan su aprobación.
  - También se guardó en la memoria del asistente.
- `lib/operaciones/client-proposals.ts` (nuevo, sin IA):
  - una consulta agrupada de workspace (180 días) por el cliente con contador;
  - para las fichas activas enlazadas al campo «Cliente» sin servicios o sin listas habituales, propone listas habituales (≥ 2 tareas), servicios por palabras clave del espacio y de la lista, y responsable habitual por mayoría;
  - caché de 10 min.
- `lib/operaciones/client-proposal-actions.ts` (nuevo, permiso `edit`):
  - `getClientProposalsAction`;
  - `applyClientProposalAction`: añade servicios con `onConflictDoNothing`, y listas solo si la ficha no tenía. Nunca sobrescribe.
- `app/(dashboard)/dashboard/operaciones/clientes/client-proposals.tsx` y `page.tsx`: sección «Ver propuestas» en Clientes.
  - Se carga al pulsar: la pantalla no llama a ClickUp para pintarse.
  - Casillas por servicio y lista, selector de responsable y «Aplicar».
- `lib/operaciones/client-activity.ts`: `taskClientOption` exportada.
- `scripts/restore-test.sh` (nuevo): restaura la última copia diaria en un PostgreSQL desechable sin red y compara las tablas con la base real.
  - Anota `restore_test_at` y `restore_test_result`.
  - En `health.ts`, comprobación «Prueba de restauración»: crítica si falla, aviso a los 40 días.
- Mi bandeja: si hay correos pendientes arriba, la lista de revisiones ya no dice «Todo al día».
- `events.ts`: evento `ficha_cliente`.
- Pruebas:
  - `tests/autonomia.test.ts`: servicio por nombre, propuesta por mayoría y prueba de restauración en Salud;
  - `tests/seguridad.test.ts`: las 2 acciones nuevas, denegadas al lector.
- Documentación:
  - `docs/ESTADO.md` §6.20;
  - `docs/PRUEBAS-EN-VIVO.md` §0.5 (cron de la prueba de restauración).
- Mapa Visual sin cambios de estructura (no hay automatización, tarea del planificador ni tabla nueva). **La comprobación pasó.**

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Propuestas sin IA:** el historial de ClickUp ya dice qué servicio es cada tarea (por su espacio y su lista) y quién la lleva. Las palabras clave y la mayoría bastan y no cuestan nada (directiva de optimización de IA).
- **Probado con datos reales en la base local** (solo lectura de ClickUp):
  - RF Serveis: web con Enric (19 tareas) y anuncios con Eury (3);
  - CM Ibérica: anuncios con Eury, y web y SEO con Jesús;
  - CrisgaBarro: web con Jesús.
- **Las propuestas no se aplican solas**, aunque parezcan claras: es la ficha del cliente y su responsable, que decide Enric.
- **La prueba de restauración usa un contenedor `--network none` sin volumen**, borrado al terminar. Solo escribe en la base real para anotar el resultado.

## Qué verificar manualmente
- En producción, Operaciones → Clientes → «Ver propuestas»: revisar y aplicar.
- Instalar `scripts/restore-test.sh` en el cron del servidor (§0.5 de la guía) y lanzarlo una vez a mano.

## Pendientes detectados
- Las palabras clave de servicios están en el código. Si se crean servicios nuevos, se usa también su etiqueta; si no basta, convendría poder editarlas.
- Una ficha sin opción del campo «Cliente» enlazada no recibe propuesta: hay que enlazarla primero en su ficha.
- Siguen pendientes de la revisión:
  - D4 IA de reserva (toca el núcleo);
  - acción «reasignar» en la bandeja de salida (migración);
  - aviso de cuota de Resend.
