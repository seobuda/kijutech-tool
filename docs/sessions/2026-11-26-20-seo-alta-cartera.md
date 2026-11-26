# SEO parte 2: alta de la cartera (la IA propone, el equipo confirma)
**Fecha:** 2026-11-26  
**Rama:** feature/seo-alta-cartera  
**Commit:** 8e1b2a51

## Qué se construyó
Clientes de prueba que eligió Enric: **cm-iberica, rfserveis y centrosdym**. Los tres tienen Search Console; solo cm-iberica tiene la ficha rellena.
- `lib/seo/alta/rules.ts` (puras):
  - páginas candidatas, sin legales ni blog;
  - entrada para la IA con el texto ajeno delimitado;
  - `validateProposal`: cada servicio necesita una cita en su propia página (o en un H2, el JSON-LD o una búsqueda) relacionada con su nombre; la zona, una cita en la dirección, el área de servicio o una búsqueda;
  - `webLanguages`;
  - `readiness`: la puesta en marcha, con 11 puntos.
- `lib/seo/alta/alta.ts`:
  - trabajo `seo.alta.proponer` (Haiku 5.5, una vez por rastreo);
  - guarda hechos `ia` provisionales al 40 %, con las pruebas en `source_ref`;
  - `projectReadiness` y `crawlLanguages`.
- `lib/db/migrations/0068_seo_proponer_ficha_prompt.sql`: el prompt `seo_proponer_ficha`.
- `lib/seo/expediente/rules.ts`: campos `negocio`, `publico`, `atencion` e `idiomas`; opciones de cómo atiende.
- `lib/seo/expediente/collect.ts`:
  - la ficha aporta a qué se dedica, la zona y el público;
  - los idiomas salen de la web;
  - los hechos `ia` no se borran ni se reescriben;
  - encola la propuesta.
- `lib/seo/expediente-actions.ts`:
  - pasar a la ficha también la zona, a qué se dedica y el público, **sin pisar** (`needsReplace` → «Reemplazar en la ficha»);
  - nuevas acciones `proposeFichaAction` y `startProjectSetupAction`;
  - escribir a mano los campos nuevos.
- `lib/seo/mapa/mapa.ts` y `lib/seo/preguntas/preguntas.ts`: ignoran la IA sin confirmar.
- `lib/seo/expediente/view.ts`: `proposing`.
- **UI:**
  - `expediente/puesta-en-marcha.tsx` (nuevo);
  - `dossier-panel.tsx`: las pruebas de la IA, «Reemplazar en la ficha», el selector de cómo atiende y los campos nuevos;
  - `page.tsx`.
- `tests/seo-alta.test.ts` (10 pruebas), Mapa Visual (2 pasos nuevos, «Alta del proyecto»), `docs/ESTADO.md` §6.48 y `docs/DISENO-SEO-ALTA-CARTERA.md`.

## Migraciones aplicadas
**0068_seo_proponer_ficha_prompt.sql**: solo datos.
```sql
INSERT INTO "ai_prompts" ("key", "name", "description", "system_prompt", "user_prompt_template", "is_active")
VALUES ('seo_proponer_ficha', 'SEO: proponer la ficha del cliente desde su web', '…', $prompt$…$prompt$, $tpl$…$tpl$, true)
ON CONFLICT ("key") DO NOTHING;
```
(El texto completo está en el archivo.) Backup local previo: `backups/backup_pre_alta_cartera_20261126.sql`.

## Decisiones técnicas tomadas en auto mode
- **Haiku 5.5 y no un modelo mayor.** Extraer y resumir con pruebas es una tarea sencilla. Parte se hace sin IA: las páginas candidatas, los idiomas y la zona desde la dirección.
- **Auditoría Opus:** encontró 5 fallos graves (hechos `ia` que se borraban, formato del valor, mapa y preguntas con datos sin confirmar, servicios pisados en la ficha). Todos se corrigieron antes de construir.
- **Revisor de código** (aprobó con cambios):
  - una propuesta vacía repetía la llamada a la IA en cada recogida; ahora va una vez por rastreo, marcado en el resultado del trabajo;
  - la cita tiene que compartir una palabra con el nombre del servicio;
  - la cola distingue la propuesta pedida a mano;
  - lo descartado no se reabre.
- **Sin esquema nuevo:** todo va en `seo_dossier_facts`. Las coordenadas se quedan para la parte 5 (Local).

## Prueba real (local, cm-iberica)
Haiku propuso 4 servicios correctos, cada uno con su página y una frase literal: oficinas, naves industriales, locales comerciales e interiorismo de oficinas. También «a qué se dedica» y el público. No propuso zona, porque en local no hay datos de Search Console; en producción sí los hay.

## Qué verificar manualmente
- **RF Serveis y Centros DyM:** proyecto SEO creado, con su web y su Search Console en el alcance → Expediente → «Ponerlo en marcha» → a los 10-40 minutos, revisar la propuesta de la IA (servicios con su frase, zona, a qué se dedica), confirmarla o pasarla a la ficha.
- Elegir «Cómo atiende» y marcar en Ficha → Contactos quién recibe los informes.
- **CM Ibérica:** «Pasar a la ficha» de los servicios debe avisar de que la ficha ya tiene texto y no cambiarlo sin «Reemplazar».

## Pendientes detectados
- Examen del prompt `seo_proponer_ficha` con los 3 clientes como casos, cuando haya propuestas reales.
- Semáforo de la puesta en marcha en la lista de proyectos, con consultas agrupadas.
- Coordenadas de los locales para el geo-grid (parte 5).
