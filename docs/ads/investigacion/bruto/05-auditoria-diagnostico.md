# 05 · Metodología de auditoría y diagnóstico de cuentas de Google Ads

**Investigador:** consultor PPC senior / analista de datos (subagente) · **Fecha:** 28 nov 2026
**Tema:** qué revisa un experto, en qué orden, con qué umbrales, y cómo se encuentra la causa raíz de un cambio de rendimiento.

> **Nota de método.** Se hicieron ~25 búsquedas web y se leyeron ~30 páginas antes de agotar el cupo de búsquedas de la sesión
> (límite compartido entre agentes). Search Engine Land bloquea la lectura automática (HTTP 403): sus artículos se citan por el
> resumen del buscador, no por lectura completa, y van marcados. Parte de la estadística (fórmulas) es matemática estándar y se
> presenta como tal, no como cita. Las estimaciones propias van marcadas **[estimación propia]**.

---

## Resumen (lo esencial en 15 líneas)

1. Todas las checklists serias (Digital Applied 105 puntos, Lionelz 77 puntos en español, Swydo 2026, Ryze 47, Ostend/OMT en alemán)
   coinciden en el **orden**: medición/conversiones → acceso y facturación → configuración (redes, ubicación «presencia», idioma)
   → términos de búsqueda/negativas → estructura y pujas → anuncios/recursos → landing → competencia y cuota de impresiones.
2. Lo que más dinero ahorra no es sofisticado: **Search Partners/Display activados en Búsqueda, «Presencia o interés» en negocios
   locales, términos de búsqueda sin revisar, conversiones secundarias como principales, recomendaciones autoaplicadas, expansión
   de URL final en PMax/AI Max**. Un estudio de 84 PMax (ppc.io, ago 2026) encontró el 40 % con «presencia o interés», el 50 %
   sirviendo páginas no elegidas y el 54 % sin objetivo de puja.
3. Diagnóstico de causa raíz = **descomponer la métrica en factores multiplicativos** (conversiones = impresiones elegibles × cuota
   de impresiones × CTR × CR; CPA = CPC / CR) y luego **segmentar** (campaña, dispositivo, red, término, hora, ubicación) para
   hallar quién mueve el cambio — es lo que hace el PPC Investigator de Optmyzr (Cause Chart + Root Cause Analysis).
4. Antes de diagnosticar nada hay que **descartar 4 falsas alarmas**: seguimiento roto, retraso de conversiones (los datos
   recientes están incompletos), estacionalidad semanal/anual, y cambios propios (historial de cambios). Google lista 10 causas
   oficiales de fluctuación; ninguna herramienta las cruza todas automáticamente con contexto externo (web caída, CRM, GBP, SEO).
5. Estadística: la regla de oficio «pausar tras 2-3× el CPA objetivo sin conversión» equivale casi exactamente a la «regla de
   tres» binomial: gastar k×CPA objetivo sin convertir tiene probabilidad ≈ e^(−k) si la palabra realmente convirtiera al ritmo
   objetivo (k=3 → 5 %). Para alertas «X días sin convertir» la fórmula correcta es Poisson: P(0 en N días) = e^(−λN); con
   λ = 0,5 conv/día hacen falta ~9 días para que sea raro al 1 %, no 2-3.
6. Detección de anomalías: comparar con el **mismo día de la semana** (el script oficial de Google promedia 26 semanas),
   z-score robusto (mediana/MAD), **suelo de volumen y de importe** por métrica, excluir el día en curso y los días ya marcados.
   Los suelos importan más que el sigma (Gotrellis). Umbrales en % puros fallan en cuentas pequeñas (Optmyzr).
7. Priorización: impacto económico estimado × confianza / esfuerzo; agrupar alertas por causa raíz; suprimir lo explicado por
   cambios propios o calendario; presupuesto de alertas (~10 por mañana) y registro de falsos positivos para reajustar.

---

## 1. Checklists de auditoría publicadas: qué existe

| Fuente | Tamaño | Rasgo distintivo |
|---|---|---|
| Digital Applied, «Google Ads audit checklist: 100+ items» (2026) — https://www.digitalapplied.com/blog/google-ads-audit-checklist-100-items | 105 controles en 8 bloques | Umbrales concretos (5-15 kw/grupo, 30 conv/30 días para Smart Bidding, cambios de objetivo ±20 %, CWV), puntuación impacto × esfuerzo |
| Lionelz, «Auditoría cuenta Google Ads: 77 puntos + plantilla» (2026, ES) — https://lionelz.com/blog/auditoria-cuenta-google-ads/ | 77 puntos en 13 bloques | Prioriza por **tandas** (T1 datos y riesgo; T2 gasto recortable sin riesgo; T3 aprendizaje y estructura; T4 tests); cubre AI Max y PMax 2026 |
| Swydo, «Ultimate Google Ads Optimization Checklist for Agencies (2026)» — https://www.swydo.com/blog/use-adwords-auction-details-to-generate-more-negative-keywords | 19 bloques | Cadencia semanal/quincenal/mensual/trimestral; AI Max, PMax, Consent Mode v2, «un cambio grande cada 10-14 días» |
| Ryze, «Google Ads audit checklist 2025» — https://get-ryze.ai/blog/google-ads-audit-checklist-2025 | 47 puntos (24 detallados) | Prioridad alta/media/baja; umbrales de alerta (CPA +20 %, CTR −15 %, IS −10 pt, conversiones −25 %). **Cifras de proveedor, sin metodología** |
| Nils Rooijmans, «Performance Max Audit Checklist» — https://nilsrooijmans.com/google-ads-performance-max-audit-checklist/ | 86 puntos PMax | Exclusiones, feed, monitorización con el script de Mike Rhodes |
| ppc.io (Stewart Dunlop), «How to audit Performance Max» (30 ago 2026) — https://ppc.io/blog/performance-max-audit | 5 filtros + 7 controles | **Datos reales de 84 PMax en 42 cuentas**; veredictos sano/preocupante/bajo rendimiento/matar |
| Ostend Academy, «Konto-Audit-Checkliste» (DE, PDF, 2026) — https://ostend.digital/wp-content/uploads/2026/08/ostend-academy-konto-audit-checkliste.pdf | 6 bloques, «20 minutos» | QS < 5 marcado; formato rápido (no leído entero) |
| OMT (DE) — https://omt.de/google-ads/google-ads-audit | 8 puntos | Empieza siempre por tracking; canibalización de palabras |
| Smart Insights — https://www.smartinsights.com/guides/google-ads-audit-checklist-spreadsheet/ | 70+ puntos | Plantilla Excel (no leída) |
| Single Grain (ES) — https://www.singlegrain.com/es/publicidad/plantilla-de-auditoria-de-anuncios-de-google-una-lista-de-comprobacion-exhaustiva-plantilla-gratuita/ | plantilla | No leída en detalle |
| Semrush ES, «Auditoría PPC en 10 pasos» — https://es.semrush.com/blog/como-hacer-una-auditoria-ppc | 10 pasos | Defiende revisión manual sobre herramienta |
| Channable — https://www.channable.com/blog/how-to-perform-google-ads-audit | — | Historial de cambios: 2 años en la interfaz |
| Promodo (2026) — https://www.promodo.com/blog/google-ads-audit-checklist | — | Accesos previos necesarios: Ads, GA4, Merchant Center, UTM/GCLID |
| Google, «Troubleshoot performance fluctuations» — https://support.google.com/google-ads/answer/12077891 y /12266223 | 10 causas | Lista oficial de causas (ver §3) |

**Hecho documentado vs opinión.** Casi todo lo anterior es opinión experta o de proveedor. Lo único con datos de muestra es ppc.io
(84 campañas) y Seer (221.240 ubicaciones, 2019). Los porcentajes de Ryze («89 % de cuentas con huecos de negativas»,
«canibalización sube el CPC 15-30 %») **no tienen metodología publicada: tratarlos como no verificados**.

---

## 2. Lista maestra consolidada de controles

Leyenda de **gravedad**: 🔴 crítica (datos falsos, dinero perdido cada día o riesgo de bloqueo) · 🟠 alta (desperdicio
significativo o techo de rendimiento) · 🟡 media (mejora) · ⚪ baja (higiene). (Se usan símbolos de color solo como etiqueta.)
Leyenda de **frecuencia**: D diaria · S semanal · M mensual · T trimestral · E por evento (cambio de web, migración, nueva campaña).
**Automatizable** = se puede comprobar con la API de Google Ads + datos que ya tiene la herramienta.

### 2.1 Acceso, propiedad, facturación y seguridad

| # | Control | Qué se mira / criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| A1 | Propiedad | Al menos un admin es un email del negocio del cliente; cuenta bajo la MCC correcta | 🟠 | T | Sí (API: customer_user_access) | Lionelz #1; Digital Applied 01.11 |
| A2 | Usuarios | Mínimo privilegio; quitar exempleados y agencias anteriores | 🟠 | T | Sí | Lionelz #2; Digital Applied 01.12 |
| A3 | 2FA | Activada para todos | 🟡 | T | Parcial | Lionelz #3 |
| A4 | Facturación | Método de pago válido; gasto facturado = reportado; sin pagos rechazados (Google: los problemas de pago son una de las 10 causas de caída) | 🔴 | D | Sí (billing_setup, account_budget) | Lionelz #4; Google 12077891 |
| A5 | Presupuesto de cuenta (account budget) | Fecha de fin y tope del presupuesto de cuenta no cercanos a agotarse | 🔴 | D | Sí | [estimación propia] |
| A6 | Historial de cambios | Quién cambió qué; cambios no autorizados; frecuencia de cambios (excesiva = no deja aprender; nula = abandono) | 🟠 | S | Sí, **pero la API solo da 30 días** → guardar copia propia | Optmyzr help 3075363; ppc.io check 7; Digital Applied 08.6 |
| A7 | Recomendaciones autoaplicadas | Tipos activos e historial; por defecto desactivarlas (32 de 100 cuentas tenían alguna activa) | 🟠 | M | Sí (recommendation_subscription) | ppc.io; Lionelz #23; Digital Applied 08.8 |
| A8 | Vinculaciones | GA4, Merchant Center, YouTube, Search Console apuntan a la cuenta correcta | 🟡 | T | Parcial | Lionelz #29 |
| A9 | Puntuación de optimización | **No** tratarla como KPI | ⚪ | — | — | Digital Applied 08.9 |

### 2.2 Medición y conversiones (siempre lo primero: OMT, Funnel, Databox)

| # | Control | Qué se mira / criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| M1 | Estado de cada acción | «Inactiva», «Requiere atención», «Sin conversiones recientes» → diagnóstico inmediato | 🔴 | D | Sí (conversion_action.status + diagnósticos) | Lionelz #6 |
| M2 | Caída brusca de conversiones | p. ej. 100 → 0 de un día a otro = seguimiento roto casi seguro; Google avisa de que caídas/subidas bruscas de pings afectan a Smart Bidding | 🔴 | D (horaria si hay volumen) | Sí | Funnel; Google 12077891 |
| M3 | Principal vs secundaria | Micro-conversiones (clic en teléfono, scroll) no deben ser principales junto al lead real; pasar una acción a secundaria la quita de «Conversiones» pero sigue en «Todas las conv.» y **parece una caída** | 🔴 | T + E | Sí | Lionelz #7; Databox (vía resumen buscador) |
| M4 | Nº de acciones principales | Mediana 9 en la muestra de ppc.io: demasiadas; lo sano es 1-3 que signifiquen dinero | 🟠 | T | Sí | ppc.io check 7 |
| M5 | Recuento | Leads: «Una»; ventas: «Cada una» | 🟠 | T | Sí | Lionelz #8; Digital Applied 07.2 |
| M6 | Ventana de conversión | Ajustada al ciclo de venta (p. ej. 30 días clic) | 🟡 | T | Sí | Lionelz #9; Digital Applied 06.3 |
| M7 | Atribución | Basada en datos; último clic solo justificado | 🟡 | T | Sí | Lionelz #10; Digital Applied 06.13 |
| M8 | Valores | Valor fijo para todo impide ROAS útil; en leads, valor por calidad (CRM) | 🟠 | T | Sí | Lionelz #11; Nils #14 |
| M9 | Duplicados | Una sola fuente principal por acción (GA4 importado + etiqueta nativa = doble conteo) | 🔴 | T + E | Parcial (comparar Ads vs GA4 vs CRM) | Digital Applied 07.3; Lionelz #12 |
| M10 | Etiquetado automático (GCLID) | Activado; sufijo/plantilla de seguimiento no rompen la llegada (sin `{lpurl}` se rompe) | 🔴 | T + E | Sí | Lionelz #13, #28; Digital Applied 02.14 |
| M11 | Conversiones avanzadas | Activas y sin errores de diagnóstico | 🟠 | T | Parcial | Lionelz #14; Digital Applied 07.4 |
| M12 | Consent Mode v2 (EEE) | Pasa `ad_user_data` y `ad_personalization`; obligatorio para tráfico UE | 🔴 (UE) | T + E | Parcial (rastreo web) | Lionelz #15; Swydo |
| M13 | Importaciones offline | GCLID/subidas sin errores | 🟠 | S | Sí (offline_conversion_upload diagnostics) | Digital Applied 07.5 |
| M14 | Cuadre con la fuente real | Diferencias grandes Ads vs CRM sin explicación = fallo de implementación | 🔴 | S | **Sí: tenemos GoHighLevel** | Lionelz #16; One PPC Agency |
| M15 | Prueba extremo a extremo | Enviar formulario/llamada de prueba y ver la conversión; la página de gracias dispara una sola vez | 🔴 | T + E | Parcial | Lionelz #71; Digital Applied 07.11; One PPC Agency (trimestral) |
| M16 | Etiqueta en todas las landings | Tag Assistant en cada URL final, incluidas herramientas externas (calendarios, formularios de terceros) | 🔴 | T + E | Sí (nuestro rastreador) | Lionelz #73 |
| M17 | Reglas de valor | Alguien sabe por qué existen; no inflan el ROAS | 🟡 | T | Sí | Lionelz #18; Digital Applied 06.12 |
| M18 | Objetivo de clientes nuevos | Lista de clientes actualizada | 🟡 | T | Parcial | Lionelz #19 |

### 2.3 Configuración de campañas

| # | Control | Criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| C1 | **Search Partners** | Desactivado salvo que los datos por red muestren CPA/ROAS dentro de objetivo. Decidir por CPA/ROAS, no por CTR o CR (que siempre son menores en partners). Ejemplo real: CPA partners 185 $ vs 11 $ en Google | 🟠 | M | Sí (segmento red) | Adalysis; Digital Applied 02.1 |
| C1b | Ratio de calidad partners | Heurística: CR partners / CR Google < 0,5 → problema serio (**no verificado**, de DataSlayer). Desde el 10 feb 2026 los dominios aparcados dejaron de ser superficie de anuncios en Search Partners | 🟡 | M | Sí | DataSlayer (vía buscador); ppc.land; Seer 2019 |
| C2 | Display en campañas de Búsqueda | Desactivado | 🟠 | T + E | Sí | Digital Applied 02.2; Ryze (red flag) |
| C3 | **Ubicación «Presencia» vs «Presencia o interés»** | Negocio local → «Presencia». Detectar con informe de ubicación de usuario: clics/coste fuera de la zona atendida. Excepción: turismo, inmobiliaria, educación (Google cita +5 % conversiones con P o I en esos sectores) | 🔴 (local) | T + E | Sí (geo_target_type_setting + user_location_view) | Google 1722038; Lionelz #20; ppc.io (40 % de PMax mal); Optmyzr |
| C4 | Exclusiones geográficas | Zonas de baja intención o no atendidas excluidas | 🟡 | T | Sí | Digital Applied 02.4 |
| C5 | Idioma | Explícito y coherente con anuncios y web; no «todos los idiomas» por inercia | 🟡 | T | Sí | Digital Applied 01.7; Lionelz #21 |
| C6 | Horario | Coincide con horario del negocio (llamadas fuera de horario = leads perdidos) y con patrones de conversión por hora | 🟠 (llamadas) | T | Sí (+ ficha del cliente) | Digital Applied 02.7 |
| C7 | Dispositivos | Ajustes según rendimiento real (con Smart Bidding los ajustes de puja no aplican salvo −100 %) | 🟡 | T | Sí | Digital Applied 02.5; Lionelz #26 |
| C8 | Rotación de anuncios | «Optimizar» salvo test controlado | ⚪ | T | Sí | Digital Applied 02.6 |
| C9 | Objetivo de campaña / objetivos de conversión por campaña | Alineados con el KPI real | 🟠 | T | Sí | Digital Applied 02.9-02.10 |
| C10 | Fechas de fin | Campaña no ha llegado a su fecha de fin sin querer | 🔴 | D | Sí | Google 12266223 |
| C11 | Exclusiones de IP | A nivel de cuenta (cubre PMax y Demand Gen); campaña hasta 500 IP | ⚪ | T | Sí | Lionelz #27 |
| C12 | Recursos autogenerados / AI Max | Que no prometan lo que ya no se ofrece; directrices de texto (hasta 25 exclusiones de términos por campaña) | 🟠 | M | Parcial (LLM + ficha del cliente) | Lionelz #25; Swydo |
| C13 | **Campañas actualizadas a AI Max** | Según Lionelz, desde sept. 2026 Google actualiza campañas de búsqueda con recursos automáticos o concordancia amplia a nivel de campaña; revisar cuáles cambiaron (**no verificado en fuente de Google en esta sesión**) | 🟠 | E | Sí | Lionelz #24 |
| C14 | Expansión de URL final (PMax / AI Max) | Desactivada en captación de leads o con exclusiones (blog, empleo, contacto…). 50 % de PMax de la muestra sirvió páginas no elegidas | 🟠 | M | Sí (landing page report «Selected by») | ppc.io; Lionelz #63; Google 16470459 |
| C15 | Experimentos | Documentados con hipótesis y fecha de fin | ⚪ | M | Sí | Digital Applied 02.15 |

### 2.4 Presupuesto y pujas

| # | Control | Criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| B1 | Ritmo de gasto (pacing) | Gasto acumulado vs previsto del mes; agotamiento temprano diario | 🟠 | D | Sí | AgencyAnalytics; One PPC Agency |
| B2 | «Limitada por presupuesto» + IS perdida por presupuesto | Si la campaña rentable pierde IS por presupuesto → mover dinero; si no es rentable → no es problema | 🟠 | S | Sí | Digital Applied 02.8; Lionelz #74 |
| B3 | Estrategia coherente con objetivo | Maximizar clics en campañas de leads/venta = error | 🟠 | T | Sí | Digital Applied 06.10; Lionelz #45 |
| B4 | Volumen mínimo para Smart Bidding | Opiniones: 30 conv/30 días (Digital Applied, Ryze tCPA), 50 para tROAS (Ryze), 15 conv/30 días tROAS (Lionelz, citando a Google), 15-30/mes para empezar (Swydo). **No hay cifra oficial única** | 🟡 | M | Sí | varias |
| B5 | Objetivo realista | tCPA/tROAS basados en histórico; tROAS muy por encima del histórico hace perder impresiones; empezar 10-15 % más conservador | 🟠 | M | Sí | Digital Applied 06.2; Swydo; Lionelz #48 |
| B6 | Tamaño de los cambios | Cambios de objetivo ≤ ±20 % de una vez; uno grande cada 10-14 días | 🟡 | E | Sí (historial) | Digital Applied 06.5; Swydo |
| B7 | Aprendizaje | Google: estado «Aprendiendo» ≤ 7 días; converge en 1-2 ciclos de conversión; evaluar con **2 ciclos o 2 semanas, lo que sea mayor**, más retraso de conversión. Cambios de presupuesto, objetivo, creatividades o segmentación **no** disparan «Aprendiendo» | 🟡 | E | Sí (bidding_strategy status) | Google 13020501 |
| B8 | Ajustes de estacionalidad | Para eventos cortos conocidos (rebajas, promociones) | 🟡 | E | Sí | Digital Applied 06.6 |
| B9 | ECPC | Eliminado/obsoleto en 2026: migrar | ⚪ | T | Sí | Digital Applied 06.11; Swydo |
| B10 | Exploración de Smart Bidding (Shopping/PMax) | Bajar tROAS 5-30 %; no con carteras; comprobar margen | 🟡 | T | Sí | Lionelz #46 |
| B11 | Presupuestos compartidos / carteras | Justificados; campañas de la cartera con patrones parecidos | ⚪ | T | Sí | Digital Applied 01.10; Ryze #21 |
| B12 | Fragmentación | Campañas con < 15 conversiones/mes → consolidar | 🟡 | T | Sí | Lionelz #43 |

### 2.5 Palabras clave, concordancias, negativas y términos de búsqueda

| # | Control | Criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| K1 | **Informe de términos de búsqueda** | Revisar semanalmente; ordenar por coste; filtrar gasto alto sin conversiones; Google oculta términos de bajo volumen | 🔴 | S | Sí | Digital Applied 03.6, 04.8; Lionelz #30 |
| K2 | Término sin conversiones → negativa | Ejemplo de oficio: coste > 3× CPA objetivo y 0 conversiones en 90 días (SEL, vía buscador). Ver §4.2 para la base estadística | 🟠 | S | Sí | SEL «negative keywords strategy» (no leído completo) |
| K3 | Término que convierte barato no está como palabra clave | Pasar a exacta / frase | 🟡 | S | Sí | Digital Applied 03.6; brief (rutina de Eury) |
| K4 | Palabra clave con gasto y sin conversiones | 2-3× CPA objetivo (respuesta directa); 4-5× en ticket alto/ciclo largo (Optmyzr). Opteo: 3× CPA objetivo. Mirar conversiones asistidas antes | 🟠 | S | Sí | Optmyzr 2025; Opteo; Practical Ecommerce |
| K5 | Mínimo de datos antes de decidir | 30 días de datos por palabra (Digital Applied); 30, 60 o 90 días en bajo volumen (One PPC Agency) | — | — | — | |
| K6 | Concordancia amplia | Solo con Smart Bidding, buena medición y volumen | 🟠 | T | Sí | Digital Applied 03.2; Lionelz #38 |
| K7 | Duplicados / canibalización | Misma palabra en varios grupos/campañas sin intención | 🟡 | T | Sí | Digital Applied 03.5; Lionelz #39; OMT |
| K8 | Negativas que bloquean palabras propias | Avisos de conflicto | 🟠 | M | Sí | Lionelz #34; Digital Applied 04.12 |
| K9 | Marca en no-marca | Marca negativa en campañas genéricas; exclusiones de marca en PMax | 🟠 | T | Sí | Digital Applied 04.3, 04.9 |
| K10 | Negativas de empleo/«gratis»/«DIY»/«curso» | Revisadas según sector | 🟡 | T | Parcial | Digital Applied 04.5-04.6 |
| K11 | Listas compartidas | Aplicadas a todas las campañas, incluidas las nuevas. Límites: 20 listas × 5.000; negativas de cuenta hasta 1.000 | 🟡 | M | Sí | Lionelz #31-32 |
| K12 | Palabras sin impresiones | > 90 días sin impresiones o «poco volumen» → pausar/archivar. Google pausa solo las que llevan 13+ meses sin impresiones | ⚪ | T | Sí | Digital Applied 03.12; Optmyzr |
| K13 | Nivel de calidad por componentes | QS ≤ 3 (Digital Applied) / < 5 (Ostend) / < 6 (Ryze); mirar componente «por debajo de la media» ponderado por gasto | 🟡 | M | Sí | Digital Applied 03.4; Lionelz #40 |
| K14 | Origen del término en AI Max | Columna «Source»: amplia vs sin palabra clave vs URL; clics de términos ocultos cuentan en la campaña pero no salen en el informe | 🟠 | S | Sí (search_term_view con segmento de origen) | Google 16470459; Google Ads API AI Max reporting |
| K15 | Marcas de la competencia | Decisión consciente; CPA medido aparte; cumplimiento de marcas | 🟡 | M | Sí | Lionelz #35 |

### 2.6 Anuncios y recursos

| # | Control | Criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| R1 | Anuncios/recursos rechazados o limitados | Administrador de políticas; recurrir si procede | 🔴 | D | Sí (policy_summary) | Lionelz #56; AgencyAnalytics |
| R2 | RSA completos | Hasta 15 titulares y 4 descripciones; 3-4 titulares es poco; fuerza Buena/Excelente (la fuerza **no** entra en Ad Rank: es lista de tareas) | 🟡 | M | Sí | Digital Applied 05.1-05.2; Lionelz #50-51 |
| R3 | Nº de RSA por grupo | 2-3 (Geddes), hasta 5 con mucho tráfico; ≥ 3 (Digital Applied, Swydo) | ⚪ | M | Sí | SEJ podcast Geddes |
| R4 | Fijaciones | Estratégicas; Optmyzr encontró mejor CPA medio con fijación parcial (según Lionelz) | ⚪ | T | Sí | Lionelz #52 |
| R5 | Mensaje | Precio, plazo, garantía, diferenciador; coherente con la propuesta de valor del cliente | 🟡 | T | Parcial (LLM + ficha del cliente) | Lionelz #54 |
| R6 | Recursos (sitelinks ≥ 4, textos destacados, fragmentos, llamada, ubicación, precio, promoción, formulario) | Existen, apuntan a URLs vivas, sin ofertas caducadas; llamada en horario y con seguimiento; ubicación ligada a GBP verificado | 🟠 | M | Sí (+ nuestro rastreador y GBP) | Digital Applied 05.6-05.11; Lionelz #55 |
| R7 | Fatiga | Anuncios de 90+ días con CTR en caída (Ryze, no verificado); retestear cuando caen métricas o la competencia cambia oferta (Geddes) | 🟡 | M | Sí | Ryze; SEJ Geddes |
| R8 | Etiquetas de rendimiento de recursos | Recurso «bajo» > 30 días → sustituir (PMax) | 🟡 | M | Sí | ppc.io check 4 |

### 2.7 Landing

| # | Control | Criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| L1 | **URL final viva** | 200, sin redirección rota, sin 404/5xx; cualquier URL de sitelink también | 🔴 | D (horaria si hay gasto alto) | **Sí: vigilancia de páginas caídas ya existe en el módulo SEO** | [estimación propia]; Funnel |
| L2 | Velocidad | LCP ≤ 2,5 s p75 (móvil y escritorio), CLS < 0,1, INP < 200 ms; < 3 s de carga | 🟡 | M | **Sí: PageSpeed/CrUX ya existe** | Digital Applied 07.8; Lionelz #70 |
| L3 | Coincidencia con intención | La página muestra lo que promete el anuncio y la palabra clave | 🟠 | T | Parcial (LLM: palabra → anuncio → landing) | Lionelz #69; Funnel |
| L4 | Formulario funciona | Prueba real; campos mínimos, errores visibles | 🔴 | T + E | Parcial | Digital Applied 07.10; Nils #46 |
| L5 | Móvil | Sin pop-ups que tapen; clic para llamar y teclado numérico correctos | 🟡 | T | Parcial | Lionelz #72 |
| L6 | Cambios en la web | Un cambio en la landing coincide con la caída de CR | 🔴 (si coincide) | E | **Sí: registro de cambios de la web ya existe** | Funnel («landing page changes») |

### 2.8 Audiencias

| # | Control | Criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| U1 | Observación vs segmentación | Remarketing en «Segmentación» por error deja la campaña sin alcance | 🟠 | T | Sí | Lionelz #57 |
| U2 | Listas de clientes | Actualizadas (mejor automáticas desde CRM); excluir clientes recientes en captación | 🟡 | T | Sí (GoHighLevel) | Lionelz #58 |
| U3 | Audiencias similares | Retiradas en agosto 2023 → usar segmentación optimizada | ⚪ | — | — | Swydo |

### 2.9 Performance Max (y Demand Gen)

| # | Control | Criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| P1 | Filtro de idoneidad | Leads: ciclo < 6 meses, ≥ 30 leads cualificados/mes en la cuenta, búsqueda ya rentable, una acción principal que signifique dinero, ≥ 5.000 $/mes. Si falla alguno → «aún no» | 🟠 | T | Sí | ppc.io |
| P2 | Canibalización de marca | % de gasto/conv. de PMax en categorías de marca (mediana 14 % de clics; 32/84 > 20 %; 12/84 > 50 %); recalcular ROAS solo no-marca; IS de marca en Búsqueda ≥ 90 % | 🔴 | M | Sí | ppc.io check 1 |
| P3 | Reparto por canal | Leads: debe dominar Búsqueda; alerta si ~1/3 del gasto va a Display/Vídeo con pocas conversiones | 🟠 | M | Sí (informe de canales desde 2025) | ppc.io check 2; Swydo; Lionelz #59 |
| P4 | Categorías de búsqueda | Revisar las 20 con más gasto; negativas de cuenta/campaña para las que no son cliente | 🟠 | M | Sí | ppc.io check 3; Lionelz #60-61 |
| P5 | Desperdicio | Gasto sin conversiones por segmento < 1/10 del gasto | 🟠 | M | Sí | ppc.io check 5 |
| P6 | Gobierno | URL expansion off (leads), presencia, objetivo de puja definido, exclusiones de marca, autoaplicadas off | 🟠 | T | Sí | ppc.io check 6 |
| P7 | Cambios | Cambios semanales de presupuesto/objetivo = nunca sale de aprendizaje; 0 cambios en un mes = abandono; antes de re-auditar, 4 semanas sin tocar | 🟡 | M | Sí | ppc.io check 7 |
| P8 | Plazos | 2-3 semanas de aprendizaje inicial; 60-90 días para optimización completa | — | — | — | Swydo |
| P9 | Exclusiones de ubicaciones | Apps, juegos, webs de baja calidad; exclusiones de ubicación a nivel de cuenta desde ene 2026 | 🟡 | M | Sí | Nils #48-53; Swydo |

### 2.10 Competencia, cuota de impresiones y subastas

| # | Control | Criterio | Grav. | Frec. | Auto | Fuente |
|---|---|---|---|---|---|---|
| I1 | IS, IS perdida por presupuesto y por ranking | IS + perdida(presupuesto) + perdida(ranking) = 100 %. Presupuesto → subir gasto si es rentable; ranking → puja o calidad. Si ambas son altas, varias fuentes recomiendan arreglar ranking primero | 🟠 | S | Sí | Google; dotidot (vía buscador); Lionelz #74 |
| I2 | Parte superior / superior absoluta | Caída de top IS con IS estable = competidor puja más o calidad baja | 🟡 | S | Sí | Optmyzr 2025 (diagnóstico de keywords) |
| I3 | Subastas (Auction Insights) | Competidor nuevo con alta tasa de solapamiento; subida de «tasa de posición superior» del rival; solo disponible si tu IS ≥ 10 % y hay actividad mínima | 🟡 | S | Sí (API desde 2024-2025 con acceso; **no verificado** si está en la API estándar) | Google 2579754 |
| I4 | Servicios Locales (LSA) | Si la categoría está dominada por LSA, el clic de Búsqueda queda más abajo | 🟡 | T | No | Optmyzr 2025 |

---

## 3. Rutinas de trabajo de un gestor PPC

### 3.1 Cadencias publicadas (consolidado)

**Diaria (o 2-3 veces por semana en cuentas estables de gasto bajo — One PPC Agency)**
- Anomalías de gasto y rendimiento; seguimiento roto; anuncios rechazados; facturación; entrega (One PPC Agency; AgencyAnalytics).
- Ritmo de presupuesto y agotamiento temprano (AgencyAnalytics).
- Promociones y horarios correctos (One PPC Agency).
- Notificaciones del sistema (AgencyAnalytics).

**Semanal**
- Rendimiento vs CPA/ROAS objetivo (One PPC Agency).
- Términos de búsqueda y negativas (todas las fuentes; Digital Applied, Swydo, Lionelz).
- Estado y limitaciones de las estrategias de puja (One PPC Agency).
- Segmentos: ubicación, dispositivo, horario, audiencia, red (One PPC Agency).
- **Calidad del lead contra el CRM** (One PPC Agency) — clave para Kijutech.
- PMax/feeds; Merchant Center «Priority fixes» en e-commerce (Swydo).
- Informe con lista de anomalías vigiladas (Digital Applied 08.4).

**Quincenal (Swydo)**: tests de anuncios, ajustes de puja, audiencias, Nivel de calidad, tendencia de CPC.

**Mensual**
- Cuadre de gasto con leads cualificados, ventas y margen; reasignación de presupuesto por rendimiento **marginal** (One PPC Agency).
- Estructura y solapamientos; experimentos; recomendaciones y autoaplicadas; previsiones (One PPC Agency).
- Lista de negativas de cuenta; historial de cambios exportado (Digital Applied 04.1, 08.6).
- Informe al cliente (AgencyAnalytics).

**Trimestral**
- Prueba de seguimiento extremo a extremo; auditoría de objetivos, valores e importaciones (One PPC Agency).
- Estrategia de marca/Búsqueda/PMax; landing y recorrido de venta; hoja de ruta de 90 días (One PPC Agency).
- Auditoría estructural completa (Digital Applied 08.11; Lionelz: completa cada trimestre, rápida cada mes).

**Por evento**: web nueva, migración de etiquetas, cambio de estrategia de puja, actualización automática (AI Max), heredar una cuenta (Lionelz).

### 3.2 Principio clave: la cadencia depende del volumen, no del calendario

One PPC Agency: «la frecuencia de revisión debe depender del gasto, el riesgo, el volumen de conversiones y la promoción»; cambiar
semanalmente una campaña de bajo volumen «no la gestiona mejor», le impide reunir evidencia y estabilizar la puja. Google
(aprendizaje): evaluar con 2 ciclos de conversión o 2 semanas, lo que sea mayor. Swydo/Digital Applied: un cambio significativo
cada 10-14 días; objetivos ±20 % como máximo.

**Implicación para Kijutech:** la rutina actual (Eury revisa lunes/miércoles/viernes todas las cuentas igual) es el patrón que
estas fuentes desaconsejan: se mira mucho donde no hay datos para decidir y poco donde el problema es urgente (seguimiento roto
o web caída un viernes por la tarde). Lo correcto: **vigilancia automática continua de lo crítico** (D) + **revisión humana con
cadencia proporcional al volumen** de cada cuenta.

### 3.3 Tiempo por tarea

No se encontró ninguna fuente que publique tiempos por tarea (AgencyAnalytics, MeasureU, One PPC Agency no los dan; MeasureU solo
dice «auditoría de 10 minutos» y Ostend «20 minutos» para auditorías rápidas). Estimación de oficio para una cuenta de servicios
locales de tamaño medio (3-8 campañas) **[estimación propia, no verificada]**:

| Tarea | A mano | Con herramienta buena |
|---|---|---|
| Comprobación diaria (gasto, conversiones, rechazos, facturación) | 3-5 min/cuenta | 0 (alerta solo si hay algo) |
| Términos de búsqueda semanales | 15-30 min/cuenta | 3-5 min (aprobar propuestas) |
| Revisión semanal de rendimiento + segmentos | 20-40 min/cuenta | 5 min (leer diagnóstico) |
| Diagnóstico de una caída | 30-120 min | 5-10 min |
| Auditoría completa trimestral | 3-6 h/cuenta | 30-60 min (validar hallazgos) |
| Informe mensual | 30-60 min/cuenta | 5-10 min |

Con 25 cuentas, solo la parte semanal manual son ~15-30 h/semana, lo que encaja con «3 días de revisiones minuciosas» del brief.

---

## 4. Diagnóstico de causa raíz

### 4.1 Lo que dicen las fuentes

- **Google (oficial)** — 10 causas de fluctuación: (1) cambios recientes de configuración; (2) seguimiento y retraso de conversiones;
  (3) pujas y objetivos; (4) presupuesto; (5) calidad/cobertura y diversidad de creatividades; (6) segmentación y solapamientos;
  (7) políticas y revisión; (8) facturación y otros problemas de cuenta; (9) dinámica de subasta; (10) cambios del mercado
  (Google Trends). Herramienta: **Explicaciones** (pasar el ratón sobre valores subrayados → «Ver explicación»; compara con el
  periodo anterior de igual duración; disponible en Búsqueda con la mayoría de estrategias, App con tCPA y PMax). Además, Google
  avisa de que desde el 17 ago 2026 actualizó los sistemas de puja para campañas limitadas por presupuesto (fluctuaciones
  temporales en tCPA/tROAS). — https://support.google.com/google-ads/answer/12077891 · https://support.google.com/google-ads/answer/12266223
- **Optmyzr PPC Investigator** — dos niveles: **Cause Chart** (árbol de métricas desde las impresiones elegibles/volumen de
  búsqueda hasta conversiones, que marca dirección y magnitud de cada factor) y **Root Cause Analysis** (top 3 movimientos
  positivos y negativos por campaña, grupo, palabra, red, dispositivo, y **combinaciones** como palabra + dispositivo; cada
  movimiento se desglosa en subcontribuyentes; enlace al historial de cambios de esa entidad). Compara con el periodo anterior de
  igual duración. No publica cómo calcula la contribución. Limitación: historial de cambios de la API = 30 días. —
  https://help.optmyzr.com/en/articles/3075363 · https://martech.org/how-to-check-why-ppc-performance-changed/ (2019)
- **Método «arriba-abajo» y «abajo-arriba»** (Optmyzr en MarTech, 2019): arriba-abajo = KPI → factores (conversiones = clics × CR;
  clics = impresiones × CTR) → filtros de segmento → entidades que más se mueven. Abajo-arriba = periodo malo vs periodo normal por
  entidad, unir, calcular diferencia, ordenar. Casos típicos: cambio de mezcla de consultas (consultas que pasan de bajo a alto
  volumen), declive lento (4 semanas seguidas de CTR en caída con volumen suficiente — script «Declining Ad Groups» de Google),
  variantes cercanas en exacta, cambio de mezcla de dispositivos hacia móvil con peor CR.
- **SEL «PPC diagnostics: low conversions»** (solo resumen del buscador; 403): empezar por tráfico — ¿gasta Google todo el
  presupuesto o se frena?; si la caída dura hasta 7 días, no hacer cambios grandes; variaciones de ~10 % son normales.
- **SEL «Google Ads performance declines»** (solo resumen): árbol de métricas por niveles — conversiones → ¿CTR estable o CR
  cayó? → experiencia de landing → dispositivo (en su ejemplo, caída concentrada en móvil); advierte que impresiones y tráfico
  suelen ser métricas de vanidad/diagnóstico.
- **Funnel (act. jul 2026)**: orden — seguimiento (100 → 0 = roto) → Nivel de calidad e impresiones → negativas → volumen de
  búsqueda externo (Keyword Planner) → cambios en la landing → cambios de producto/oferta (ej. DSA de 12 a 3 categorías).
- **HawkSEM (ago 2025)**: localizar el inicio (30 días diarios) → historial de cambios (revertir lo que coincida) → subastas y IS →
  verificar etiquetas → estacionalidad → **mirar otros canales** (si SEO y social también caen, el problema es mayor: reputación,
  mercado).
- **Optmyzr, keywords que no convierten (jun 2025)**: palabras → visibilidad (IS, top IS, abs top IS, subastas, LSA) → anuncios →
  landing → estructura (secundarias que distorsionan) → oferta y precio frente a competidores → atribución (asistidas).

**Hueco:** ninguna fuente publica un árbol **completo** que cruce datos de la plataforma con datos externos (web caída, cambio de
web, CRM, demanda orgánica, reseñas). Se construye abajo.

### 4.2 Identidades para descomponer (matemática estándar)

Para un periodo:

```
Impresiones      = ImpresionesElegibles × IS
IS + IS_perdida_presupuesto + IS_perdida_ranking = 1   (solo Búsqueda; Display tiene su propia IS)
Clics            = Impresiones × CTR
Coste            = Clics × CPC
Conversiones     = Clics × CR
CPA              = Coste / Conversiones = CPC / CR
ROAS             = Valor / Coste = (CR × ValorMedio) / CPC
ImpresionesElegibles ≈ Impresiones / IS        (estimación del mercado disponible)
```

**Descomposición logarítmica (aditiva y sin depender del orden).** Como son productos, el cambio relativo se reparte exacto con
logaritmos:

```
ln(Conv1/Conv0) = ln(Eleg1/Eleg0) + ln(IS1/IS0) + ln(CTR1/CTR0) + ln(CR1/CR0)
ln(CPA1/CPA0)   = ln(CPC1/CPC0) − ln(CR1/CR0)
Contribución del factor f = ln(f1/f0) / ln(KPI1/KPI0)      (suman 100 %)
```

Ejemplo: conversiones −30 % (ln = −0,357). Elegibles −5 % (−0,051), IS −20 % (−0,223), CTR +2 % (+0,020), CR −10 % (−0,105).
→ 62 % de la caída es cuota de impresiones, 29 % CR, 14 % demanda, −6 % CTR. Siguiente pregunta: ¿IS perdida por presupuesto o
por ranking? Este es el método LMDI (Log Mean Divisia Index) de economía, aplicado a PPC **[recomendación propia; ninguna fuente
PPC lo nombra]**. Es lo que permite al agente decir «el 62 % de la caída viene de perder visibilidad».

**Descomposición por mezcla (mix vs tasa).** Un CR o CPA de cuenta puede empeorar sin que ningún segmento empeore, solo porque el
tráfico se desplaza hacia segmentos peores (móvil, partners, una campaña genérica, AI Max ampliando). Con s_i = cuota de clics del
segmento i y CR_i:

```
CR_total = Σ s_i · CR_i
ΔCR = Σ (s_i1 − s_i0) · CR_i0       ← efecto mezcla
    + Σ s_i0 · (CR_i1 − CR_i0)      ← efecto tasa
    + Σ (s_i1 − s_i0)(CR_i1 − CR_i0) ← interacción
```

Para CPA se aplica a CPC y CR por separado o con un contrafactual: «CPA si el segmento i hubiera mantenido sus valores del
periodo base»; la diferencia es la contribución de i. Para conversiones absolutas basta ΔConv_i por segmento (suma exacta). Esto
es lo que el Root Cause Analysis de Optmyzr presenta como «top movers» (su cálculo exacto no se publica).

**Búsqueda de la combinación culpable.** Recorrer dimensiones (campaña → grupo → palabra → término; × dispositivo, red, ubicación,
hora, día, audiencia, tipo de concordancia/origen AI Max) y quedarse con la celda que explica más ΔKPI con menos «superficie».
Heurística: elegir la dimensión cuya descomposición concentra ≥ 60-70 % del cambio en ≤ 3 elementos, y bajar un nivel
**[estimación propia]**.

### 4.3 Árbol de causa raíz completo (propuesto)

```
0. ¿ES REAL EL CAMBIO?  (antes de diagnosticar)
   0.1 ¿Los datos son maduros?  Días recientes con conversiones aún por llegar (retraso) → ajustar o esperar (§5.3)
   0.2 ¿Es ruido?  Comparar con mismo día de semana / intervalo esperado (§5.5). Variación ~10 % = normal (SEL)
   0.3 ¿Estacionalidad?  Mismo periodo año anterior, festivos locales, Google Trends, clics orgánicos de Search Console
   0.4 ¿Cambio de definición?  Acción pasada a secundaria (cae «Conversiones», no «Todas»), ventana o recuento cambiados,
       nueva acción principal, conversiones por hora de conversión vs de impresión (Ads atribuye al día del clic)
   └─ si es real → 1

1. ¿SE ROMPIÓ LA MEDICIÓN?  (causa más cara y más frecuente de «caída repentina»)
   1.1 Estado de acciones de conversión (inactiva / sin conversiones recientes / errores de conversiones avanzadas)
   1.2 Caída a ~0 de un día a otro en una acción concreta mientras clics siguen → etiqueta rota
   1.3 Ads vs GA4 vs CRM (GoHighLevel): si el CRM sigue recibiendo leads y Ads no → medición; si el CRM también cae → real
   1.4 Cambio en la web (registro de cambios / despliegue / plugin de consentimiento) en la fecha del cambio
   1.5 Consent Mode / CMP nuevo → caída de conversiones observadas (modeladas tardan)
   1.6 Importación offline con errores
   └─ si la medición está bien → 2

2. ¿CAMBIOS PROPIOS O DE GOOGLE?
   2.1 Historial de cambios en la ventana [inicio − 14 días, inicio]: puja, objetivo, presupuesto, negativas, pausas,
       concordancias, anuncios, segmentación, horario, ubicación (y quién)
   2.2 Recomendaciones autoaplicadas
   2.3 Actualizaciones automáticas (AI Max, migración Display → Demand Gen, cambios de sistema de puja anunciados)
   2.4 Estrategia «Aprendiendo» / «Limitada» / objetivo demasiado exigente
   └─ si no hay cambio que lo explique → 3

3. ¿LA CUENTA PUEDE SERVIR?  (entrega)
   3.1 Facturación / presupuesto de cuenta agotado / fecha de fin
   3.2 Anuncios, recursos o palabras rechazados o limitados (política); verificación de anunciante; marca registrada
   3.3 URL final caída (404/5xx) → anuncio rechazado por destino o CR a 0
   3.4 Presupuesto agotado antes (hora de agotamiento) / IS perdida por presupuesto ↑
   └─ si sirve con normalidad → 4 (descomponer el KPI)

4. DESCOMPONER EL KPI (§4.2) y seguir la rama con más contribución

   4A. IMPRESIONES ↓
       ├─ Impresiones elegibles ↓ (= demanda)  → Google Trends, Search Console (impresiones orgánicas de las mismas
       │     consultas), estacionalidad, festivos, clima, noticias; competidor/LSA/AI Overviews ocupando la SERP
       ├─ IS ↓ por presupuesto ↑  → presupuesto recortado, CPC ↑ con mismo presupuesto, nueva campaña en presupuesto compartido
       ├─ IS ↓ por ranking ↑     → (a) puja/objetivo: tCPA bajado, tROAS subido, límites; (b) calidad: QS por componente ↓,
       │                            anuncio rechazado parcialmente, landing más lenta/peor; (c) competencia: subastas →
       │                            competidor nuevo con solapamiento alto, «posición superior» ↑, «superación» ↓
       └─ Cobertura ↓            → palabras pausadas o «poco volumen», negativas nuevas que bloquean, segmentación
                                    estrechada (ubicación, idioma, horario, audiencia en «segmentación»)

   4B. CTR ↓ (con impresiones estables)
       ├─ Posición ↓ (top / abs top IS ↓) → rama 4A-ranking
       ├─ Mezcla de consultas peor (más amplia / AI Max / variantes cercanas / partners) → términos y red
       ├─ Anuncios: cambio de RSA, recursos perdidos (sitelinks rechazados), fatiga, oferta peor que la del competidor
       └─ SERP: más anuncios/LSA/AI Overview/Shopping encima; competidor con oferta agresiva

   4C. CPC ↑
       ├─ Competencia (subastas: solapamiento y posición superior del rival ↑) / temporada
       ├─ Puja: objetivo cambiado, estrategia cambiada, ajuste de estacionalidad olvidado
       ├─ Calidad ↓ (QS) → mismo puesto cuesta más
       └─ Mezcla: más peso de palabras/segmentos caros (efecto mezcla)

   4D. CR ↓ (con clics estables)  ← la rama más importante en leads
       ├─ Medición (volver a 1) — siempre primero
       ├─ Landing: caída/errores, lentitud (CrUX/PageSpeed), cambio de diseño o formulario, pop-up, teléfono roto,
       │     formulario de terceros caído, consentimiento bloqueando
       ├─ Mezcla de tráfico: dispositivo (móvil), red (partners/Display), ubicación (fuera de zona: «presencia o interés»),
       │     hora (fuera de horario del negocio), términos nuevos poco relevantes (AI Max/amplia), expansión de URL final
       ├─ Oferta y mercado: precio/oferta del competidor, temporada, reputación (reseñas GBP ↓), cambio en el negocio
       │     (servicio que ya no se ofrece, horario reducido, sin stock)
       └─ Calidad del lead (CRM): leads llegan pero no cualifican → problema de segmentación o de mensaje, no de volumen

   4E. CPA ↑ = CPC ↑ (4C) y/o CR ↓ (4D) → la descomposición logarítmica dice cuál pesa más
   4F. Gasto ↑ sin conversiones → presupuesto subido, objetivo relajado, término/ubicación nueva que se come el gasto,
       clics no válidos (picos por hora, IP, ubicaciones raras), Smart Bidding explorando tras cambio

5. VALIDAR LA HIPÓTESIS
   5.1 ¿El momento coincide (fecha de inicio = fecha del cambio/evento)?
   5.2 ¿La magnitud explica el cambio (contribución ≥ 50 %)?
   5.3 ¿Hay un contrafactual (otras campañas/cuentas sin el cambio no cayeron)? En una agencia con 25 cuentas: si TODAS caen
       el mismo día → causa común (Google, festivo, caída de plataforma); si solo una → causa local
   5.4 Nivel de confianza y siguiente comprobación si es baja
```

**Cruces que solo puede hacer Kijutech** (datos ya en la herramienta): ficha del cliente (horario, zona atendida, servicios
vigentes → ramas 4A cobertura, 4D oferta); Search Console (demanda: impresiones orgánicas de consultas equivalentes, distingue
«cayó el mercado» de «perdimos subasta»); GA4 (sesiones por landing y por fuente para validar medición); GBP (reseñas, llamadas,
horario); rastreador + vigilancia de caídas + registro de cambios de la web (rama 1.4 y 4D landing); PageSpeed/CrUX; GoHighLevel
(1.3 y calidad del lead); Clarity (errores JS, clics de rabia en el formulario); comparación entre las 25 cuentas (5.3).

### 4.4 Cómo presentar un diagnóstico (formato de salida sugerido)

«**Campaña X: 3 días sin conversiones** (esperado: 4,5; probabilidad de que sea azar: 1,1 %). **Causa más probable (confianza
alta): la landing /reformas-cocina devuelve 500 desde el martes 10:40** (vigilancia web). Descartado: seguimiento (el CRM tampoco
recibe leads de esa página), presupuesto (IS perdida por presupuesto 2 %), competencia (subastas sin cambios). **Acción:** avisar
a desarrollo / pausar campaña hasta que vuelva. Impacto estimado: 1,5 leads/día × 38 € CPA.»

---

## 5. Estadística aplicada: cuándo hay datos suficientes

### 5.1 Palabra/término sin conversiones: la base de la regla «2-3× CPA objetivo»

Si la tasa real de conversión fuera la esperada p, la probabilidad de **0 conversiones en n clics** es (1−p)^n ≈ e^(−np).

- Para estar seguro al 95 % de que la tasa real es menor que p: n ≥ ln(0,05)/ln(1−p) ≈ **3/p** (la «regla de tres»).
- Si el CPA objetivo es CPA* = CPC/p, gastar **k × CPA*** sin convertir equivale a n = k/p clics, y P(0 | p) ≈ **e^(−k)**:
  k=1 → 37 %; k=2 → 13,5 %; k=3 → **5 %**; k=4 → 1,8 %; k=5 → 0,7 %.

Es decir, la regla de oficio «2-3× el CPA objetivo» (Optmyzr: 2-3× en respuesta directa, 4-5× en ticket alto; Opteo: 3×) es la
regla de tres binomial disfrazada **[deducción propia, matemáticamente exacta bajo el supuesto Poisson]**. Lo que la regla no
dice: (a) solo prueba que la palabra es peor que «exactamente en objetivo», no que sea mala; una palabra al 60 % del objetivo
también es mala y requiere más datos; (b) no cuenta el retraso de conversión; (c) con muchas palabras evaluadas a la vez, por puro
azar ~5 % de palabras buenas caen al umbral k=3 (comparaciones múltiples) → usar k=3-4 en cuentas con cientos de palabras o
exigir confirmación adicional.

Reglas de clics publicadas: Opteo minClics = (1/CR medio) × X (X=3 conversiones → 30 clics a CR 10 %); Adbadger 30-35 clics a
CR 10 %; otra agencia 20 clics mínimo, 30-50 en ticket alto; Practical Ecommerce > 100 clics y < 1 conversión en 60 días;
LeadLiftoff 12+ clics (agresivo). Fuentes en §10.

### 5.2 Intervalos de confianza para CR bajos

El intervalo «normal» (p ± 1,96·√(p(1−p)/n)) falla con CR bajos y pocos datos. Usar **Wilson** (matemática estándar):

```
centro = (p̂ + z²/2n) / (1 + z²/n)
margen = z·√( p̂(1−p̂)/n + z²/4n² ) / (1 + z²/n)        z = 1,96 (95 %)
```

Ejemplo: 2 conversiones en 40 clics (p̂ = 5 %) → Wilson 95 % ≈ [1,4 %, 16,5 %]. Con CPC 2 € eso es CPA entre 12 € y 145 €: no se
puede decidir. Con 0 conversiones, el límite superior ≈ 3/n (regla de tres).

### 5.3 Enfoque bayesiano (recomendado para bajo volumen)

Las patentes de Google («Continuous value-per-click estimation for low-volume terms», US 8117066) y la literatura (Rutz, Bucklin
y Sonnier, JMR 2012) usan **Beta-Binomial con información compartida** entre palabras: el CR observado de una palabra con pocos
clics se «encoge» hacia el CR de su grupo/campaña.

```
Prior: CR ~ Beta(α0, β0), con α0 = m·μ, β0 = m·(1−μ)
  μ = CR del grupo o campaña (o del sector), m = fuerza del prior en «clics equivalentes»
Posterior tras c conversiones y n clics: Beta(α0 + c, β0 + n − c)
Media posterior: (m·μ + c) / (m + n)
Decisión: P(CPA > 1,5 × CPA*) = P(CR < CPC / (1,5·CPA*)) = CDF_Beta(...)  → actuar si > 0,9 y el gasto es material
```

El valor de m no está en las fuentes; se calibra con la varianza histórica entre palabras (bayes empírico: ajustar α0, β0 por
momentos a los CR de palabras con volumen) **[recomendación propia]**. Ventaja: una misma regla sirve para cuentas de 5 leads/mes y
de 500, y da una probabilidad legible («91 % de probabilidad de que esta palabra esté por encima de 1,5× el CPA objetivo»).

### 5.4 Retraso de conversiones y madurez de los datos

- Google: las conversiones se atribuyen a la **fecha del clic/impresión**, pueden llegar hasta 90 días después según la ventana;
  los periodos recientes parecen peores; recomienda rangos que terminen ≥ 30 días atrás (o más con ventanas largas) para datos
  completos; segmentar por «Días hasta la conversión» (hasta 19 filas); columnas «Conversiones (por hora de conv.)» para alinear con
  GA4. — https://support.google.com/google-ads/answer/6239119 · https://support.google.com/google-ads/answer/14545572
- Método: construir con el segmento «días hasta la conversión» la curva acumulada F(d) por cuenta y acción. Conversiones
  ajustadas de un día de edad a: conv_obs / F(a). No juzgar CR/CPA de días con F(a) < 0,8-0,9; marcar «inmaduro» en pantalla
  **[recomendación propia]**. En leads de servicios (formulario, llamada) el retraso suele ser corto (horas-1 día), pero las
  importaciones offline del CRM (lead cualificado, venta) pueden tardar semanas.
- Gotrellis: **nunca puntuar el día en curso** (conversión parcial → falsa caída de CR); el script de Google resta 3 h de retraso
  de informe.

### 5.5 Detección de anomalías

**Línea base estacional.** El día de la semana pesa más que muchas anomalías (Gotrellis). Opciones:
1. Mismo día de la semana: el script oficial «Account Anomaly Detector» compara lo acumulado hoy hasta la hora H con la media
   de los **26 mismos días de semana** anteriores hasta H; umbrales multiplicativos por métrica (p. ej. impresiones/clics/
   conversiones < 0,5 × media; coste > 1,5 × media); un correo por tipo de alerta y día; recomienda ejecución horaria o diaria a
   mediodía si molesta. Versión MCC para varias cuentas. Optmyzr ofrece la variante con umbral simétrico (p. ej. 0,20 = ±20 %) y
   N semanas configurables. — https://developers.google.com/google-ads/scripts/docs/solutions/account-anomaly-detector ·
   https://help.optmyzr.com/en/articles/3120951-anomaly-detector-user-guide
2. Índice de día de semana: índice_d = media(d)/media global; x' = x/índice_d; puntuar x' (Gotrellis).
3. Descomposición estacional (STL) o modelos tipo SARIMA/Prophet: Datadog documenta tres algoritmos — *basic* (cuantil móvil, sin
   estacionalidad), *agile* (SARIMA robusto, se adapta rápido a cambios de nivel), *robust* (descomposición estacional-tendencia,
   sigue alertando de desplazamientos lentos); requieren ≥ 3 periodos estacionales de historia (3 semanas para estacionalidad
   semanal) y usan hasta 6 semanas. — https://docs.datadoghq.com/monitors/types/anomaly/

**Puntuación.**
- z = (x − μ)/σ; |z| > 2 inusual, > 3 anómalo (convención). Robusto: z_r = 0,6745·(x − mediana)/MAD (constante estándar para
  equivaler a σ en normal) — Gotrellis recomienda mediana/MAD sin dar la constante.
- Para **recuentos** (conversiones, leads) con pocos eventos, z no sirve: usar Poisson/binomial negativa. P(X ≤ x | λ) con λ =
  esperado del día. Gotrellis: 0 pedidos en 6 clics con CR base 10 % pasa el 53 % de las veces (0,9^6).
- Gotrellis (Amazon PPC, pero transferible): la mayoría de operadores acaban entre **2,5 y 3,5 σ** una vez puestos los suelos de
  volumen e importe; con 10.000 objetivos, a 2 σ saltan ~460 por azar y a 3 σ ~27; elegir el umbral por *backtesting* de 90 días
  para que salgan las alertas que una persona lee de verdad (~10 por mañana).

**Alerta «N días sin conversiones» bien hecha (lo que pide Kijutech).** Con λ = conversiones esperadas por día (media de los
mismos días de semana, ajustada por gasto si el gasto cambió):

```
P(0 conversiones en N días) = e^(−λ·N)
Alertar si e^(−λ·N) < α   ⇔   N ≥ ln(1/α) / λ
```

| Conversiones esperadas/día | α = 5 % (N ≥ 3/λ) | α = 1 % (N ≥ 4,6/λ) |
|---|---|---|
| 3 | 1 día | 2 días |
| 1,5 | 2 días | 3-4 días |
| 1 | 3 días | 5 días |
| 0,5 | 6 días | 9-10 días |
| 0,2 (≈ 6/mes) | 15 días | 23 días |

Conclusión: «2-3 días sin convertir» solo es señal en campañas con ≥ 1,5-2 conversiones/día; en las pequeñas genera falsas
alarmas. Además: si el gasto de esos días también cayó, la ausencia de conversiones es consecuencia (ir a la rama de entrega), no
causa **[deducción propia]**.

**Derivas lentas.** Un −2 % diario son −25 % en dos semanas (0,98^14) y no dispara un z-score con línea base móvil (Gotrellis).
Soluciones: comparar con una ventana de referencia fija o con el mismo periodo del año anterior; CUSUM o regresión de tendencia
sobre 4-8 semanas; el script «Declining Ad Groups» de Google (CTR en caída 3-4 semanas seguidas) es el ejemplo clásico
(MarTech/Optmyzr 2019).

**Higiene de la línea base.** Excluir de la línea base los días ya marcados como anómalos (si no, un pico infla σ y tapa el
siguiente); un problema persistente se marca el día 1 y luego «desaparece» al entrar en la base (Gotrellis).

### 5.6 Tests de anuncios y de landing

- Adalysis (cofundado por Brad Geddes): mínimos **por anuncio** antes de calcular confianza — bajo tráfico 350 impresiones / 300
  clics / 7 conversiones; medio 750 / 500 / 13; alto 1.000 / 1.000 / 20; marca conocida 100.000 / 10.000 / 100-1.000; al menos
  una semana (mejor 1-3 meses). Ejemplo: con 97 impresiones un anuncio «ganaba» al 97 % de confianza; con ~1.000 por anuncio ganó
  otro al 99,96 %. — https://adalysis.com/blog/how-much-data-should-you-have-before-examining-an-ad-test-result/
- Geddes (SEJ podcast): 2-3 anuncios por grupo (hasta 5 con mucho tráfico); mínimo una semana porque domingo y martes son muy
  distintos; elegir métrica por objetivo (leads/conversiones/ingresos por impresión; CTR «métrica terrible» por sí sola); no
  calcular significancia a mano. — https://www.searchenginejournal.com/importance-ad-testing-brad-geddes-podcast/326395
- Métrica recomendada en leads: **conversiones por impresión** (combina CTR y CR) **[práctica habitual de Adalysis/Geddes; la
  página leída no la detalla]**.
- Tamaño de muestra: Evan Miller n ≈ 16·σ²/δ² por variante, σ² = p(1−p); o la fórmula clásica
  n = (z_α/2 + z_β)²·[p1(1−p1) + p2(1−p2)]/(p1−p2)². **No mirar a medias** (peeking): parar al primer «significativo» puede llevar el
  falso positivo del 5 % al 26 %; usar diseño secuencial o bayesiano. — https://www.evanmiller.org/how-not-to-run-an-ab-test.html
- Con RSA, Google rota combinaciones y no reparte tráfico al 50 %: los tests de anuncio son observacionales; los experimentos de
  campaña (drafts & experiments) son el único A/B limpio en la plataforma **[conocimiento de oficio, no verificado en esta sesión]**.

### 5.7 Regresión a la media y selección

Si cada semana se pausan las palabras con peor CPA y se suben las de mejor CPA, parte de la «mejora» o «empeoramiento» posterior
es regresión a la media: los extremos de una muestra pequeña vuelven solos hacia el promedio. Defensas **[recomendación propia;
no se pudo buscar una fuente PPC específica por el límite de búsquedas]**: (1) encogimiento bayesiano (§5.3) antes de ordenar;
(2) evaluar el efecto de una acción contra un control (campañas/cuentas similares no tocadas) o con experimentos; (3) no medir el
éxito de una pausa con el mismo periodo que se usó para seleccionarla.

---

## 6. Priorización y fatiga de alertas

### 6.1 Cómo ordenan los hallazgos las fuentes

- Digital Applied: puntuar cada hallazgo por **impacto en ingresos × esfuerzo** y convertirlo en backlog ordenado (08.12).
- Lionelz: **tandas** — T1 datos y riesgo (lo que falsea todo lo demás), T2 gasto recortable sin riesgo, T3 aprendizaje de pujas y
  estructura, T4 tests. Lógica: primero lo que invalida las decisiones, luego lo que ahorra sin riesgo, luego lo que necesita
  tiempo para aprender, y al final lo creativo.
- Ryze: alta (acción el mismo día) / media (semana) / baja (mes).
- SEJ (vía buscador): no hacer cambios durante la auditoría salvo lo crítico.

### 6.2 Fórmula de prioridad propuesta [recomendación propia]

```
Prioridad = (Impacto_€_mensual × Confianza × Urgencia) / Esfuerzo
  Impacto_€: gasto desperdiciado evitable, o conversiones perdidas × valor del lead (o × CPA objetivo si no hay valor)
  Confianza: probabilidad posterior (§5.3) o p-valor convertido; 1,0 para hechos deterministas (URL 404, pago rechazado)
  Urgencia: 3 si pierde dinero cada hora (web caída, seguimiento roto, facturación), 2 semanal, 1 estructural
  Esfuerzo: minutos estimados para aplicar (1 = un clic; 5 = rediseñar landing)
```

Hallazgos «binarios» de configuración (presencia o interés, partners, autoaplicadas) se estiman con el gasto afectado × fracción
desperdiciada observada (p. ej. coste de clics de fuera de la zona en los últimos 30 días).

### 6.3 Contra la fatiga de alertas (lo que dicen las fuentes)

- **Suelos de volumen y de importe** por métrica: lo más eficaz (Gotrellis: «los suelos importan más que el sigma»; un 3σ en algo
  que gasta 1,40 $/día es real pero irrelevante). Optmyzr reconoce que en cuentas de pocas impresiones una variación de 50
  impresiones puede salir como anomalía; un experto de SEL propone exigir también un cambio **absoluto** mínimo.
- **Una alerta por tipo y día** (script de Google); preferir resumen diario a una hora razonable (Optmyzr).
- **Agrupar** las marcas que comparten campaña o día en una sola (Gotrellis) → en nuestro caso, **una alerta por causa raíz**, no
  una por métrica: «landing caída» explica a la vez CR ↓, CPA ↑ y conversiones ↓.
- **Suprimir lo explicado**: cambios propios del historial, festivos, promociones, eventos conocidos (Gotrellis).
- **Excluir el día en curso** en métricas de conversión (Gotrellis).
- **Registrar falsos positivos** y reajustar umbrales periódicamente (MetricsWatch); *backtesting* de 90 días para fijar el umbral
  según cuántas alertas se leen de verdad (Gotrellis).
- **Dirección ≠ deseabilidad**: una marca estadística dice que algo cambió, no si es malo (Gotrellis) → clasificar como problema,
  oportunidad o informativo.
- Limitación conocida del script de Google: no dice **qué parte** de la cuenta causó la anomalía (Optmyzr/SEL) → nuestro agente
  debe adjuntar siempre la descomposición (§4.2).

---

## 7. Ideas para nuestro módulo

1. **Motor de controles declarativo** (como los procesos del Mapa Visual): cada control de §2 es una regla con `id`, `qué mira`,
   `consulta GAQL`, `umbral` (configurable en el panel, con valor por defecto y por cliente), `gravedad`, `frecuencia`,
   `explicación`, `acción propuesta`, `fuente`. Así la auditoría trimestral completa y la vigilancia diaria salen del mismo
   catálogo. Empezar por los ~25 controles T1/T2 (medición, facturación, rechazos, presencia, partners, Display, autoaplicadas,
   URL expansion, términos con gasto sin conversiones, landing caída).
2. **Cadencia adaptativa por volumen**: cada cuenta/campaña tiene su «reloj estadístico» (conversiones esperadas por día). Los
   controles deterministas corren cada hora; los estadísticos solo cuando hay datos para decidir (§5.1, §5.5). Eury deja de mirar
   todo L-X-V y recibe una cola priorizada.
3. **Alerta «sin conversiones» con Poisson y con el porqué**: N mínimo por campaña según λ (tabla §5.5), y al dispararse ejecutar
   automáticamente el árbol §4.3 (medición → cambios → entrega → descomposición) y adjuntar la causa más probable con su confianza.
4. **Descomposición LMDI + mezcla** como servicio interno: dado un KPI y dos periodos, devuelve contribuciones por factor (demanda,
   IS-presupuesto, IS-ranking, CTR, CPC, CR) y top movers por dimensión y combinaciones. Es el corazón del «porqué» y es puro
   cálculo (sin IA, coste cero); la IA solo redacta la explicación final (Haiku basta) — cumple la directiva de optimización de IA.
5. **Cruces exclusivos de Kijutech** como ramas del árbol: vigilancia de caídas y registro de cambios de la web (1.4, 3.3, 4D),
   CrUX (4D), Search Console para separar «cae la demanda» de «perdemos subasta» (4A), GoHighLevel para separar «medición rota» de
   «caída real» y para la calidad del lead (1.3, 4D), GBP (reseñas, horario), ficha del cliente (zona atendida vs informe de
   ubicaciones; horario del negocio vs programación de anuncios; servicios vigentes vs anuncios y recursos autogenerados).
6. **Contrafactual entre cuentas**: si 15 de 25 cuentas caen el mismo día → «causa común» (Google/festivo/caída de plataforma),
   una sola alerta de agencia en vez de 15.
7. **Historial de cambios propio**: la API solo da 30 días; guardar `change_event` a diario en `ads_*` para tener años y poder
   correlacionar cambios con efectos (y medir el resultado de cada acción propuesta: «aprendizaje» del agente).
8. **Probabilidad bayesiana en cada propuesta**: «pausar término X — 93 % de probabilidad de CPA > 1,5× objetivo; gasto 30 días:
   84 €». Prior jerárquico (término → grupo → campaña → sector entre clientes de la agencia).
9. **Madurez de datos visible**: curva de retraso por cuenta/acción; días inmaduros en gris; ninguna regla de CR/CPA usa días con
   F < 0,85.
10. **Cola de hallazgos con prioridad €** (§6.2), agrupados por causa raíz, con estados (nuevo, aceptado, aplicado, descartado con
    motivo) y registro de falsos positivos que reajusta umbrales; presupuesto de alertas por persona y día; resumen diario por
    Telegram vía `ops_notifications` y empuje inmediato solo para urgencia 3.
11. **Auditoría de entrada al heredar o dar de alta una cuenta** (Lionelz: «por evento») con informe por tandas T1-T4 en ES, listo
    para el cliente.
12. **Bloqueo de «manos inquietas»**: avisar si se propone tocar una campaña en aprendizaje o con < 2 ciclos de conversión desde el
    último cambio (Google 13020501; ppc.io; Swydo 10-14 días).

## 8. Lo que nadie hace bien (huecos del mercado)

1. **Causa raíz con contexto externo.** Optmyzr descompone métricas y señala entidades; Google da «Explicaciones» dentro de la
   plataforma. Nadie cruza automáticamente con la web (caída, cambio, velocidad), el CRM, la demanda orgánica y la ficha del
   negocio. Es justo lo que Kijutech ya tiene.
2. **Umbrales estadísticamente correctos y adaptados al volumen.** Las herramientas usan % de cambio o reglas fijas (el script de
   Google, Optmyzr ±20 %); fallan en cuentas pequeñas, que son la mayoría en una agencia de negocios locales. Ninguna fuente
   pública usa Poisson/Beta para «días sin convertir» o «pausar término».
3. **Una alerta por causa, no por métrica.** El script de Google no dice qué parte de la cuenta causó la anomalía; las alertas se
   multiplican por métrica.
4. **Retraso de conversiones integrado en las reglas.** Google lo explica, pero las reglas automáticas y los scripts típicos
   evalúan días inmaduros.
5. **Medir el efecto de las propias acciones** (antes/después con control) para que el sistema aprenda qué recomendaciones
   funcionan en cada sector. Nadie lo publica.
6. **Comparación entre cuentas de la misma agencia** (benchmarks propios por sector y detección de causa común).
7. **Validación semántica cliente ↔ anuncio ↔ landing** con la ficha del negocio (servicios vigentes, zona, horario) para detectar
   recursos autogenerados de AI Max/PMax que prometen lo que el cliente no ofrece.

## 9. Lo no verificado

- Cifras de Ryze (89 % de cuentas con huecos de negativas, CPC +15-30 % por canibalización, etc.): sin metodología.
- Umbral «CR partners / CR Google < 0,5» (DataSlayer): heurística de un proveedor, leída solo por resumen del buscador.
- Afirmaciones de Lionelz sobre la actualización automática a AI Max desde sept. 2026, la migración irreversible de Display a Demand
  Gen desde junio 2026 y el retraso de la migración DSA → AI Max a feb. 2027: no contrastadas con documentación de Google en esta
  sesión.
- Volúmenes mínimos para Smart Bidding (15/30/50 conversiones): opiniones divergentes; Google no fija una cifra en la página leída.
- Artículos de Search Engine Land (diagnóstico de bajas conversiones, caídas de rendimiento, monitorización entre auditorías,
  script de anomalías granulares, negativas): **no leídos** (403); se usan solo los fragmentos del buscador.
- Disponibilidad de Auction Insights en la API estándar de Google Ads: no comprobada.
- Tiempos por tarea (§3.3): estimación propia; no hay fuente publicada.
- Método LMDI, bayes empírico, CUSUM y constante 0,6745 del MAD: técnicas estadísticas estándar propuestas aquí, no tomadas de
  fuentes PPC.
- El cupo de búsquedas se agotó antes de cubrir: árboles de Brad Geddes/Adalysis específicos, regresión a la media en PPC con
  fuente, rutinas de agencias concretas (Brainlabs, Hanapin/Brainlabs, KlientBoost, Seer) y fuentes en francés/portugués/neerlandés.
  Se recomienda una segunda pasada si se necesita.

## 10. Fuentes

**Google (oficial)**
- Troubleshooting performance fluctuations (10 causas): https://support.google.com/google-ads/answer/12077891
- Troubleshoot Search campaign fluctuations (Explicaciones; cambios de puja 17 ago 2026): https://support.google.com/google-ads/answer/12266223
- About Smart Bidding learning: https://support.google.com/google-ads/answer/13020501
- Conversion delay / days to conversion: https://support.google.com/google-ads/answer/6239119 · https://support.google.com/google-ads/answer/14545572
- About advanced location options: https://support.google.com/google-ads/answer/1722038
- Auction insights: https://support.google.com/google-ads/answer/2579754
- AI Max reporting: https://support.google.com/google-ads/answer/16470459 · https://developers.google.com/google-ads/api/docs/campaigns/ai-max-for-search-campaigns/ai-max-reporting
- Account Anomaly Detector (script): https://developers.google.com/google-ads/scripts/docs/solutions/account-anomaly-detector · MCC: https://developers.google.com/google-ads/scripts/docs/solutions/manager-account-anomaly-detector
- Search partner network (parked domains): https://support.google.com/google-ads/answer/16286960 · https://services.google.com/fh/files/misc/understanding_search_partner_network.pdf

**Herramientas y proveedores**
- Optmyzr PPC Investigator: https://help.optmyzr.com/en/articles/3075363 · Root cause: https://help.optmyzr.com/en/articles/3075372-root-cause-analysis-in-ppc-investigator
- Optmyzr en MarTech, «How to check why PPC performance changed» (2019): https://martech.org/how-to-check-why-ppc-performance-changed/
- Optmyzr, Keywords not converting (jun 2025): https://www.optmyzr.com/blog/google-ads-keywords-not-converting/
- Optmyzr Anomaly Detector: https://help.optmyzr.com/en/articles/3120951-anomaly-detector-user-guide · Anomaly alerts: https://help.optmyzr.com/en/articles/5595430-anomaly-alerts
- Optmyzr, location targeting mistakes: https://www.optmyzr.com/blog/google-ads-location-targeting-mistakes/
- Optmyzr, Google Ads audit: https://www.optmyzr.com/blog/google-ads-audit/
- Adalysis, ad test data minimums: https://adalysis.com/blog/how-much-data-should-you-have-before-examining-an-ad-test-result/
- Adalysis, evaluar Search Partners: https://adalysis.com/blog/how-to-evaluate-search-partners-on-google-ads-microsoft-ads/
- Opteo, Pause keyword: https://opteo.com/docs/en/articles/11769301-pause-keyword
- Gotrellis, anomaly detection (Amazon PPC): https://gotrellis.com/resources/blog/amazon-ppc-anomaly-detection
- MetricsWatch, anomaly detection PPC/SEO: https://metricswatch.com/insights/anomaly-detection-for-ppc-and-seo-campaigns
- Datadog anomaly monitors: https://docs.datadoghq.com/monitors/types/anomaly/

**Checklists y guías**
- Digital Applied 105 puntos (2026): https://www.digitalapplied.com/blog/google-ads-audit-checklist-100-items
- Lionelz 77 puntos (2026, ES): https://lionelz.com/blog/auditoria-cuenta-google-ads/
- Swydo 2026: https://www.swydo.com/blog/use-adwords-auction-details-to-generate-more-negative-keywords
- Ryze 2025: https://get-ryze.ai/blog/google-ads-audit-checklist-2025
- Nils Rooijmans, PMax audit: https://nilsrooijmans.com/google-ads-performance-max-audit-checklist/
- ppc.io, PMax audit (ago 2026): https://ppc.io/blog/performance-max-audit
- One PPC Agency, rutina: https://oneppcagency.co.uk/google-ads/optimisation/
- AgencyAnalytics, PPC management checklist (jun 2026): https://agencyanalytics.com/blog/ppc-management-checklist
- MeasureU: https://measureu.com/adwords-optimization-checklists/
- Funnel, performance drops (act. jul 2026): https://funnel.io/blog/google-ads-performance-drops
- HawkSEM, drop in performance (ago 2025): https://hawksem.com/blog/drop-in-google-ads-performance/
- Ostend Academy (DE): https://ostend.digital/wp-content/uploads/2026/08/ostend-academy-konto-audit-checkliste.pdf · OMT (DE): https://omt.de/google-ads/google-ads-audit
- Semrush ES: https://es.semrush.com/blog/como-hacer-una-auditoria-ppc · Channable: https://www.channable.com/blog/how-to-perform-google-ads-audit · Promodo: https://www.promodo.com/blog/google-ads-audit-checklist · Single Grain ES: https://www.singlegrain.com/es/publicidad/plantilla-de-auditoria-de-anuncios-de-google-una-lista-de-comprobacion-exhaustiva-plantilla-gratuita/ · Smart Insights: https://www.smartinsights.com/guides/google-ads-audit-checklist-spreadsheet/

**Search Partners**
- Seer Interactive (2019): https://www.seerinteractive.com/insights/search-partner-parked-domains-garbage
- PPC.land, fin de dominios aparcados: https://ppc.land/google-quietly-kills-parked-domain-ads-from-search-partner-network/
- DataSlayer (solo resumen): https://www.dataslayer.ai/blog/pmax-search-partners-visibility-is-finally-here

**Estadística**
- SEJ, podcast con Brad Geddes sobre tests: https://www.searchenginejournal.com/importance-ad-testing-brad-geddes-podcast/326395
- Evan Miller, How not to run an A/B test: https://www.evanmiller.org/how-not-to-run-an-ab-test.html
- Rutz, Bucklin, Sonnier (JMR 2012), palabras de bajo volumen: https://faculty.washington.edu/orutz/docs/Keywords_JMR_2012.pdf
- Patente Google US 8117066 (estimación de valor por clic en términos de bajo volumen): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8117066

**Search Engine Land (solo fragmentos del buscador, 403 al leer)**
- https://searchengineland.com/ppc-diagnostics-low-conversions-450710
- https://searchengineland.com/google-ads-performance-declines-460018
- https://searchengineland.com/google-ads-performance-drops-recover-444357
- https://searchengineland.com/ppc-monitoring-check-between-audits-491668
- https://searchengineland.com/script-getting-granular-adwords-account-anomaly-alerts-249139
- https://searchengineland.com/negative-keywords-strategy-476563
