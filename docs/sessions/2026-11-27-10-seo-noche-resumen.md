# SEO: resumen del encargo de la noche (26-27 nov) y victorias rápidas de la simulación
**Fecha:** 2026-11-27  
**Rama:** feature/seo-victorias (más las ramas de cada parte, todas fusionadas en main)  
**Commit:** ver la última fusión en main

## Qué se construyó esta noche (en producción, cada parte con su documento de sesión)
| Parte | Qué | Migración | Sesión |
|---|---|---|---|
| 5c | Citas: teléfonos antiguos, directorios y páginas de zona/puerta | — | `2026-11-27-01-seo-local-5c.md` |
| 6a | Técnico 2b: soft 404, staging, nofollow, schema, tecnología y hackeo | — | `2026-11-27-02-seo-tecnico-2b.md` |
| 6b | Registro de cambios y páginas de dinero | 0072 | `2026-11-27-03-seo-cambios-dinero.md` |
| 7 | Demanda: volumen, intención SERP, ideas y demanda sin página | 0073 | `2026-11-27-08-seo-demanda.md` |
| 8 | Medir: ¿funcionó? (DiD) y diagnóstico de caídas | — | `2026-11-27-09-seo-medir.md` |
| 9a | Contenido: briefs, nota, enlazado y contenido que pierde tráfico | 0074 | `2026-11-27-09-seo-contenido.md` |
| 11 | Tendencias por técnica entre clientes y orden del plan | — | `2026-11-27-10-seo-orquestar.md` |
| UX | Pestaña Resumen, sub-vistas y listas plegadas | — | `2026-11-27-10-seo-ux.md` |
| Simulación | Cliente ficticio de 4 meses: atascos y papel de los agentes de IA | — | `docs/SIMULACION-SEO-CLIENTE.md` |

**No construido** (decisión o dato de Enric; ver `docs/PENDIENTES-ENRIC.md`):
- 9b WordPress;
- 10 Autoridad: contratar proveedor;
- 10b GoHighLevel: token;
- 12 Informe: depende de 10b;
- panel de IA (11): presupuesto.

## Victorias rápidas de la simulación (esta rama)
- `lib/seo/avisos.ts` (nuevo): aviso por Telegram al dueño y del proyecto. Un fallo del aviso no tumba el proceso que lo pide.
- `lib/seo/vigilancia/hackeo.ts`: avisa al abrirse un hackeo crítico. No avisa cada semana ni si una persona lo descartó.
- `lib/seo/medir/diagnostico.ts`: avisa al abrirse una caída de visitas (una vez por episodio).
- `lib/seo/plan/plan.ts`: «verificación fallida». Una propuesta hecha hace 14 días o más deja de cubrir sus hallazgos si siguen abiertos y ya pasó una auditoría completa después; entonces vuelven al plan.
- `lib/seo/alta/rules.ts` y `alta.ts`: la puesta en marcha pide también la ficha de Google confirmada y el acceso a la web (13 puntos).
- `tests/seo-victorias.test.ts`.

## Migraciones aplicadas
En esta rama, ninguna. Esta noche: 0072, 0073 y 0074 (ver sus sesiones). Producción tiene 75.

## Decisiones técnicas tomadas en auto mode
- **Proceso de cada parte:** diseño con 3 puntos de vista, auditoría Opus 5.5 con esfuerzo alto, código, revisor de código y despliegue. En todas, la auditoría cambió decisiones de fondo (anotado en cada diseño).
- **Lo que roza las líneas rojas no se construye:** WordPress, contratar, publicar y el panel de IA con presupuesto nuevo.
- **Incidente:** dos commits de la 6a se hicieron en *detached HEAD* y no llegaron a producción. Se recuperaron con cherry-pick en la parte 8. Desde entonces se comprueba la rama antes de cada commit.
- **Pruebas sobre un contenedor viejo:** una vez, las pruebas pasaron sobre el contenedor anterior porque la compilación había fallado. Desde entonces se comprueba que el contenedor arranca («Started») antes de fiarse de las pruebas.

## Revisor de código (victorias)
Aprobar con cambios. Arreglado:
- el aviso de hackeo no se repite si se descartó;
- la verificación fallida exige una auditoría posterior (antes de eso los hallazgos aún no se habían cerrado);
- el aviso no puede tumbar el detector.

## Qué verificar manualmente
- **centrosdym:** el mapa por zonas ya funcionó en producción (media 2,9 / 2,6 / 4; top 3 en el 76 / 80 / 56 %), así que la identificación de su ficha es correcta. La pestaña Resumen se ve bien con sus datos.
- **cm-iberica:** Palabras → Demanda → «Volumen e intención» y «Buscar ideas»; Palabras → Briefs → preparar uno.
- **Plan → Resultados:** aparecerán resultados cuando haya encargos hechos hace 4 semanas.

## Pendientes detectados
Ver `docs/SIMULACION-SEO-CLIENTE.md`, atascos 3 a 14:
- apartado SEO en el informe semanal;
- «Encargar al redactor» desde el brief;
- tipo de trabajo SEO en los encargos;
- posiciones por población;
- jefe SEO de cuenta (agente).
