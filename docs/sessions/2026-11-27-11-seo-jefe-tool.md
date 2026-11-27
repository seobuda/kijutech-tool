# SEO para los agentes: herramienta «seo_proyecto»
**Fecha:** 2026-11-27  
**Rama:** feature/seo-jefe-tool  
**Commit:** ver la fusión en main

## Qué se construyó
- **`lib/seo/agente-tool.ts` (nuevo):** herramienta «seo_proyecto» (solo lectura, módulo SEO, `registerTools` del núcleo). Para un cliente o proyecto devuelve:
  - la puesta en marcha que falta;
  - los problemas abiertos más graves con su explicación y la receta;
  - el plan;
  - los briefs;
  - el enlace al Resumen.

  Las URLs, los títulos y las búsquedas van al final, dentro de `<datos_no_fiables>`.
- `lib/seo/plan/rules.ts`: `techniqueRecipe(technique)`.
- `lib/seo/register.ts`: la registra.
- **`lib/agentes/store.ts`:**
  - la añade al jefe de Operaciones (también en sus herramientas por defecto) y al principal, con las actualizaciones `2026-11-27-seo-proyecto-*`;
  - las instrucciones del jefe la citan en las dudas de SEO.
- `tests/agentes.test.ts`: lista de herramientas del principal al día. Pasan las 837.
- `docs/ESTADO.md` §6.62 y `docs/SIMULACION-SEO-CLIENTE.md` (atasco 10 hecho).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Solo lectura.** El jefe no puede cambiar nada de SEO: explica y escala, como con el resto.

## Revisor de código
Aprobar con cambios. Arreglado:
- los datos de webs van marcados como no fiables y recortados;
- los comodines de la búsqueda se escapan;
- hay presupuesto por sección, y el plan y los briefs no se pierden.

## Qué verificar manualmente
- Por Telegram, como alguien del equipo: «¿cómo arreglo el soft 404 de centrosdym?». El jefe usa «seo_proyecto» y responde con la receta. El jefe de Operaciones viene apagado de serie: hay que encenderlo para probarlo.

## Pendientes detectados
Atascos que siguen pendientes (`docs/SIMULACION-SEO-CLIENTE.md`):
- posiciones por población;
- horas reales;
- Para ti por eventos;
- intervenciones huérfanas;
- gasto del agente.
