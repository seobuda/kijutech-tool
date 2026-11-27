# Simulación: un cliente SEO de principio a fin (27 nov 2026)

Encargo de Enric: simular un cliente real con todos sus datos y ver cómo trabajan juntos el equipo humano y los agentes de IA, para que la herramienta se haga cargo de los proyectos SEO con apoyo humano.

**Cómo se hizo:** un subagente Opus 5.5 (esfuerzo alto) leyó el código de `feature/seo-ux` y simuló semana a semana. Lo marcado [NV] no está verificado.

**Cliente ficticio:**
- **Reformas Vallès SL**, de Sabadell. Hace reformas integrales y de cocinas y baños, y atiende a domicilio en Sabadell, Terrassa y Sant Cugat.
- **Web:** WordPress con Elementor y Yoast.
- **Ficha de Google:** 40 reseñas.
- **Datos:** Search Console conectado; 3 competidores.
- **Contrato:** 10 h al mes.
- **Equipo:** un técnico SEO junior y un redactor; Enric supervisa.

## 1. Línea de tiempo

**Día 1** (1,5–2 h de una persona):
- **Alta:** se da de alta el cliente y el proyecto (web y Search Console en el alcance) y se pulsa «Ponerlo en marcha».
- **Lo que hace el sistema solo:**
  - da de alta 10 procesos;
  - rastrea hasta 500 páginas, pasa la auditoría y prepara el expediente;
  - la IA propone el negocio, los servicios y la zona;
  - hace el mapa de palabras y el plan;
  - descarga el histórico de Search Console.
- **Lo que hace la persona:**
  - confirma servicios, zona, «a domicilio» e idiomas (30–45 min);
  - busca la competencia y confirma las fichas de Google (20–30 min);
  - prepara el correo de preguntas al cliente, que Enric aprueba.

**Semana 1:**
- **Sistema:** primeras posiciones (hasta 50 búsquedas), foto de la ficha, mapa por zonas en un laborable de 10 a 12 y demanda.
- **Plan:** propuestas por reglas repartidas en las 10 h.
- **Persona:** «Aprobar lo de este mes» crea los encargos en ClickUp.

**Semanas 2–4:**
- **Junior:** trabaja en WordPress, Yoast y Elementor (8–10 h) y cierra las tareas en ClickUp.
- **Sistema:** pone la fecha de «hecho» cada hora y vigila cada 6 h las páginas de dinero (incluidas las de los encargos).

**Mes 2:**
- **Sistema:** auditoría mensual (lo arreglado se cierra solo), plan rehecho y aviso por Telegram a Enric.
- **Redactor:** brief → «Copiar como texto» → redacta → «Ya está publicada».
- **Local:** sale «reseñas por detrás de la competencia». La campaña de reseñas se hace fuera de la herramienta.

**Meses 2–4:**
- **Sistema:** mide a los 28, 56 y 90 días.
- **Caída de tráfico** (semana 10, aprox.): se crea el hallazgo, pero **sin aviso a nadie**.
- **Mes 4:** no hay informe; Enric lo monta a mano.
- **Coste de datos real:** unos 0,75 $ al mes (tope de 5 $).

## 2. Atascos, por impacto

| # | Atasco | Dónde | Arreglo | Tamaño | Estado |
|---|---|---|---|---|---|
| 1 | **Lo importante no llega a nadie.** Hackeo crítico, caída diagnosticada, caída de posiciones o del mapa y cambios de ficha no avisan. SEO no tiene apartado en el informe semanal. Los avisos solo van a Enric. | `hackeo.ts`, `medir/diagnostico.ts`, `registerReportSection` | Apartado SEO en el informe semanal, aviso de hackeo y caída, aviso al responsable del servicio | M | **Avisos de hackeo y caída: hechos (27 nov)**; el resto, pendiente |
| 2 | **El bucle de verificación está roto.** Un hallazgo que sigue abierto tras una propuesta «hecha» no se vuelve a proponer. `checkAfterDays` no lo usa nadie. | `plan.ts:75` | Reproponer como «Verificación fallida» lo que sigue abierto 14 días después | M | **Hecho (27 nov)** |
| 3 | **Las horas del plan son estimadas.** No aprende de los tiempos reales y los encargos van sin tipo de trabajo. | `plan.ts:334,188` | Tipo de trabajo SEO, consumido = máximo entre lo estimado y lo real | M | Pendiente |
| 4 | **Las tres poblaciones no se miden.** Hay una sola ubicación para las posiciones y el geo-grid cubre ±3 km. | `posiciones/rules.ts:103`, `geogrid-rules.ts:12` | Ubicación por búsqueda y una cuadrícula por población | M | Pendiente |
| 5 | **Contenido desconectado.** El brief no crea encargo y la propuesta no enlaza con su brief. | `briefs.ts` | «Encargar al redactor» desde el brief y «Pedir brief» desde la propuesta | S-M | Pendiente |
| 6 | **La puesta en marcha no lleva lo que bloquea:** ficha de Google, accesos, responsable, GA4. | `alta/rules.ts` | Añadir esos puntos | S | **Hecho (27 nov)** (ficha y accesos) |
| 7 | **Para ti hace ruido y las tarjetas de proyecto no avisan.** | `lib/inicio/para-ti.ts:131` | Entradas por evento; semáforos en Proyectos | S-M | Pendiente |
| 8 | **Dos cerebros:** el plan por reglas (proyecto) y el estratega Opus (cliente). | Estrategia y plan | Que el estratega ordene dentro del plan SEO (protocolo de decisión) | M-L | Pendiente (decisión) |
| 9 | **El cliente queda fuera del bucle:** reseñas, accesos y explicaciones van por WhatsApp; no hay informe. | SEO no usa `createClientMessage` | «Preparar correo al cliente» con aprobación; parte 12 | S-M / L | Pendiente (parte 12 necesita GoHighLevel) |
| 10 | **El jefe de operaciones no ve SEO.** | `agentes/store.ts:85` | Herramienta `seo_proyecto` por capacidad | S-M | Pendiente |
| 11 | **El on-page es 100 % manual:** «reescribir 40 títulos» sin borrador. | Plan | Agente redactor on-page (abajo) | M | Pendiente |
| 12 | **Intervenciones huérfanas:** `requestStatus` nunca dice «cancelada». | `operaciones/work-source.ts:321` | Detectar tareas borradas | S | Pendiente |
| 13 | **Medición poco concluyente en una pyme** [NV]: pocos clics por URL. | — | Apoyarse en posiciones, geo-grid y contactos (GoHighLevel) | — | Aceptado |
| 14 | **Gasto:** el tope no se reparte por prioridad y la herramienta SERP del agente no cuenta. | `agentes/register.ts:90` | Reserva por proceso; contar la del agente | S | Pendiente |

## 3. Papel de los agentes de IA (hoy no hay ninguno de SEO)
| Agente | Qué decide | Qué aprueba la persona |
|---|---|---|
| **A. Jefe SEO de cuenta** (Sonnet semanal, Opus mensual) | Prioriza las propuestas del mes según los objetivos y la memoria del cliente, explica cada novedad y escribe una nota semanal de 5 líneas. Se fusionaría con el estratega. | El plan del mes (botones que ya existen) |
| **B. Redactor on-page** (Haiku o Sonnet) | Borrador de título y meta descripción por URL con su búsqueda de Search Console. El código valida longitud, unicidad y que lleve la búsqueda. | El junior lo revisa y lo pega |
| **C. Brief → borrador** (Sonnet) | Primer borrador con «[verificar: dato real]» | El redactor edita; publicar, siempre con aprobación |
| **D. Diagnóstico en lenguaje claro** | Junta capas, cambios y novedades de Google | Enric aprueba el texto, que vale también para el cliente |
| **E. Informe mensual** (parte 12) | Borrador desde Resumen y resultados | Sale por `client_messages`, con aprobación |
| **F. Jefe de operaciones** con `seo_proyecto` | Resuelve las dudas del equipo sobre cada receta | — |

Cada agente nuevo es una decisión de producto con coste (directiva de IA y protocolo de decisión): queda propuesto, no construido.

## 4. Victorias rápidas (hechas el 27 nov)
1. **Aviso de hackeo y de caída de tráfico** (Telegram al dueño y alerta del proyecto), una vez por episodio.
2. **Verificación fallida:** lo que sigue abierto 14 días después de hecha su propuesta vuelve al plan marcado.
3. **Puesta en marcha:** ficha de Google confirmada y accesos anotados.

**Pendientes de esta lista:**
- el apartado SEO en el informe semanal;
- «Encargar al redactor» desde el brief;
- el tipo de trabajo SEO en los encargos.

Se proponen para la próxima sesión.
