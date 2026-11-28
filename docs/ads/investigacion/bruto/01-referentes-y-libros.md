# 01 · Referentes mundiales de Google Ads / PPC, sus libros y sus métodos

**Investigación en bruto · 28 nov 2026 · tema 01 del módulo Google Ads de Kijutech**

> Convención: **[H]** = hecho documentado (fuente primaria o dato publicado), **[O]** = opinión de experto,
> **[A]** = anécdota / caso aislado, **[NV]** = no verificado (no se pudo leer la fuente primaria o viene de un resumen de
> terceros). Cada afirmación importante lleva su URL. Las fuentes de Search Engine Land y WordStream devolvieron 403 al
> lector automático: sus datos aparecen solo cuando los recogía otra fuente legible, y se marcan como tal.
> Límite práctico: a mitad del trabajo se agotó el cupo de búsquedas web de la sesión; a partir de ahí solo se pudieron
> leer páginas cuya URL ya se conocía (blogs de los propios expertos). Eso afecta sobre todo al apartado en español
> (ver §5 y «Lo no verificado»).

---

## Resumen (lo esencial en 15 líneas)

1. **Quién manda hoy en el sector.** El ranking más serio y reciente es el *Top 50 Most Influential PPC Experts 2026* de
   PPCsurvey.com (TrueClicks), heredero del Top 25 de PPC Hero (2012-2021). Top 10 de 2026: Jyll Saskin Gales, Frederick
   Vallaeys, AJ Wilcox, Kirk Williams, Nils Rooijmans, Igor Ivitskiy, Mike Rhodes, Mike Ryan, Brad Geddes, Aaron Young.
2. **El consenso de 2024-2026**: la máquina (Smart Bidding, broad, PMax, AI Max) ejecuta; el experto **define el objetivo
   de negocio, mete datos buenos (CRM, lead cualificado, márgenes), vigila y corrige**. Vallaeys lo formaliza como
   «automation layering» y los tres papeles del experto: **médico, profesor y piloto**.
3. **El desacuerdo de 2024-2026** está en cuánto fiarse: PMax (Kirk Williams: «nunca la hemos visto peor que en 2025»),
   AI Max (Geddes: se apunta conversiones de tus exactas; smec: mediana +13 % valor pero CPA +16 %, ROAS «cara o cruz»),
   concordancia amplia (Optmyzr 2023: exacta gana en ROAS en el 72 % de cuentas) y si poner objetivos tCPA/tROAS.
4. **Reglas concretas reutilizables** que salen de sus métodos: ratio Lin-Rodnitzky 1,5-2,0 sano; negativas por
   «>60 clics, >5 €, <0,5 conv. en 90 días» (Rooijmans) **o** por juicio de intención con LLM y confianza ≥85 %;
   Smart Bidding fiable a partir de ~50 conv./30 días (Optmyzr) o ≥100/mes por campaña (Lolk); test de anuncios por
   **conversiones por impresión** (Geddes) y desconfianza de la «significancia al 95 %» mirada a diario (Röttgerding).
5. **Para leads (nuestro caso)**: pujar al **lead cualificado** importado del CRM, no al formulario; separar marca;
   desactivar la expansión de URL; presencia (no interés) en la ubicación; evaluar por coste por lead cualificado y
   detectar canibalización entre PMax/AI Max y Search (Menachem Ani, JXT).
6. **Agentes de IA**: los propios referentes (Rooijmans, Wenner, Vallaeys, Williams) coinciden en **solo lectura primero,
   un agente por tarea, análisis determinista antes del LLM, aprobación humana con registro de quién aprobó y por qué**.
7. **Cambio de agosto 2026** que cualquier vigilante debe conocer: Google dejó de rebajar pujas en campañas tROAS
   limitadas por presupuesto (smec): CPC mediano +15,8 %, la «sobre-entrega» de ROAS desapareció en 3 semanas.
8. **En español** el peso real es mucho menor: casi nadie hispano aparece en los rankings (1 española en el Top 100:
   Ana Kostic, bigmomo). Hay divulgadores grandes (Juan Lombana/Mercatitlán en LatAm, Joan Boluda en España) pero no
   métodos propios publicados al nivel de los anglosajones. **Hueco**: nuestro módulo puede ser lo más avanzado en español.

---

## 1. Cómo se identificó a los referentes (rankings y fuentes)

### 1.1 PPCsurvey.com · Top 50 Most Influential PPC Experts (2024, 2025, 2026)

- **[H]** Lo publica TrueClicks y socios; continúa la tradición del Top 25 de PPC Hero (2012-2021) y lo amplía a 50.
  https://www.ppcsurvey.com/
- **[H] Metodología 2026** (ponderada y reproducible solo en parte, los datos individuales no son públicos): votos de
  colegas 20 % (log, mínimo 10 votos válidos), charlas en inglés en 2025 15 %, podcast propio 10 %, suscriptores de
  YouTube 10 %, interacción en LinkedIn 10 %, artículos invitados 7 %, **libro publicado con ISBN 7 %**, seguidores de
  LinkedIn 7 %, apariciones como invitado en podcasts 6 %, newsletter 4 %, curso 4 %.
  https://ivitskiy.com/blog/en/ranked-6-most-influential-ppc-expert-2026/ ·
  https://www.ppcsurvey.com/top-50-ppc-experts-ranking-methodology
- **Ojo**: mide **influencia**, no calidad técnica. Un divulgador con mucho LinkedIn puede puntuar más que un técnico
  callado. Por eso este informe cruza el ranking con lo que cada uno ha publicado de método.

**Top 50 de 2026** (https://www.ppcsurvey.com/top-50-most-influential-ppc-experts-2026):

| # | Experto | Empresa | # | Experto | Empresa |
|---|---|---|---|---|---|
| 1 | Jyll Saskin Gales | Inside Google Ads | 26 | Aaron Levy | Optmyzr |
| 2 | Frederick Vallaeys | Optmyzr | 27 | Greg Finn | Cypress North |
| 3 | AJ Wilcox | B2Linked (LinkedIn Ads) | 28 | Justin Rowe | Impactable |
| 4 | Kirk Williams | ZATO Marketing | 29 | John Moran | Tier 11 |
| 5 | Nils Rooijmans | Water Cooler Topics | 30 | Andrea Cruz | Monks |
| 6 | Igor Ivitskiy | Ivitskiy Ads Lab | 31 | Isaac Rudansky | AdVenture Media |
| 7 | Mike Rhodes | Mike Rhodes Ideas | 32 | Sarah Stemen | consultora |
| 8 | Mike Ryan | Smarter Ecommerce (smec) | 33 | Joe Martinez | Paid Media Pros |
| 9 | Brad Geddes | Adalysis | 34 | Akvile DeFazio | AKvertise |
| 10 | Aaron Young | Define Digital Academy | 35 | Yoann Ferrand | Navvy (Francia) |
| 11 | Amy Hebdon | Paid Search Magic | 36 | Christine Zirnheld | Cypress North |
| 12 | Sophie Logan | Rough Agenda | 37 | Bram van der Hallen | Edge.be (Bélgica) |
| 13 | Miles McNair | PPC Mastery (NL) | 38 | Ben Heath | Heath Media |
| 14 | Andrew Lolk | savvyrevenue (Dinamarca) | 39 | Matt Shenton | Brand Schema |
| 15 | Ed Leake | God Tier Ads | 40 | Tomasz Abbott-Wieczorek | PPC Profit Club |
| 16 | Ameet Khabra | Hop Skip Media | 41 | Chris Nightingale | Can-Do Digital |
| 17 | Adriaan Dekker | (NL) | 42 | Amanda Friedt | FRDTLAB |
| 18 | Lisa Raehsler | Big Click Co | 43 | Jon Kagan | Amsive |
| 19 | Lars Maat | Maatwerk Online (NL) | 44 | Gianpaolo Lorusso | ADworld Experience (Italia) |
| 20 | Sam Tomlinson | Warschawski | 45 | Gil Gildner | Discosloth |
| 21 | Ruben Runneboom | Taskforce (NL) | 46 | Michelle Morgan | Paid Media Pros |
| 22 | Thomas Eccel | AdSea Innovations (Italia/Alemania) | 47 | Andrew Foxwell | Foxwell Digital (Meta) |
| 23 | Liam Wade | Impression (UK) | 48 | Julie Friedman Bacchini | Neptune Moon / #PPCChat |
| 24 | Bob Meijer | PPC Mastery (NL) | 49 | Duane Brown | Take Some Risk |
| 25 | Matthieu Tran-Van | freelance (Francia) | 50 | Elizabeth Greene | Junglr (Amazon) |

**Top 10 de 2024** (https://www.ppcsurvey.com/top-50-most-influential-ppc-experts-2024): Vallaeys, Kasim Aslam
(Solutions 8), Navah Hopkins (entonces Optmyzr, hoy Microsoft), Kirk Williams, Ed Leake, Greg Finn, Mike Ryan,
Brad Geddes, Susan Wenograd, Nils Rooijmans. Menachem Ani (JXT Group) fue 13.º.

**Constantes en todos los años** (2021 PPC Hero → 2024 → 2026): **Vallaeys, Geddes, Kirk Williams, Rooijmans, Ed Leake,
Mike Ryan, Andrew Lolk, Amy Hebdon, Isaac Rudansky, Julie Bacchini, Andrea Cruz, Joe Martinez, Greg Finn, Duane Brown**.
Son el núcleo estable; el resto rota.

**[H] Excluidos del ranking por trabajar para medios o plataformas** («Voices of PPC»): Ginny Marvin (Ads Product Liaison
de Google), **Navah Hopkins (Ads Product Liaison de Microsoft desde 2025)**, Anu Adegbola y Barry Schwartz (Search
Engine Land), Gianpaolo Lorusso (libro *Agile Google Ads Executive Summary*, 2018), Purna Virji.
https://www.ppcsurvey.com/voices-of-ppc

**Top 100 (lista corta) por país** (https://www.ppcsurvey.com/top-100-most-influential-ppc-experts): EE. UU. domina;
Países Bajos 9 (Rooijmans, Miles McNair, Bob Meijer, Lars Maat, Adriaan Dekker, Ruben Runneboom, Alex van de Pol,
Denie Geertzen, Wijnand Meijer); Alemania 3 (Benjamin Wenner, Boris Beceric, Cindy Ebner); Francia 3; **España 1
(Ana Kostic, bigmomo)**; Italia 1 (Thomas Eccel); Brasil 1 (Bia Camargo); Portugal 0.

### 1.2 PPC Hero Top 25 (2021, último año)

**[H]** Isaac Rudansky, Amalia Fowler, Patrick Gilbert, Kirk Williams, Navah Hopkins, Ed Leake, AJ Wilcox, Brad Geddes,
Frederick Vallaeys, Gianluca Binelli, Amy Bishop, Julie Bacchini, Mark Irvine, Andrea Cruz, Joe Martinez, Andrew Lolk,
Anders Hjorth, Robert Brady, Duane Brown, Anu Adegbola, Etgar Shpivak, Jon Kagan, Florian Nottorf, Dennis Moons,
Mareike Geidies. https://www.ppchero.com/?p=21482

### 1.3 Correcciones a la lista de partida del encargo

- **[H] *Join or Die* NO es de Vallaeys**: es de **Patrick Gilbert** (AdVenture Media), *Join or Die: Digital
  Advertising in the Age of Automation* (Mill City Press). Vallaeys, Geddes, Larry Kim y David Rodnitzky firman
  recomendaciones en la contraportada. https://tertulia.com/book/join-or-die-digital-advertising-in-the-age-of-automation-patrick-gilbert/9781632217684
- **[H] El libro de Kirk Williams** se titula *Ponderings of a PPC Professional* (con edición revisada y ampliada, ~70 %
  de contenido nuevo); *PPC Ponderings* es su **podcast**.
  https://bookscloud.io/products/ponderings-of-a-ppc-professional-revised-expanded-paperback ·
  https://podcasts.apple.com/podcast/id1592733165
- **[H] Navah Hopkins** ya no está en Optmyzr: es Ads Product Liaison de Microsoft (por eso sale del ranking).
- **[H] *Ultimate Guide to Google Ads*** (6.ª ed.) es de Perry Marshall, **Mike Rhodes** y Bryan Todd.
  https://everand.com/book/481608190/Ultimate-Guide-to-Google-Ads
- **[NV] «Thomas Byrne»**: no se encontró ningún referente PPC con ese nombre en los rankings consultados; no se incluye.

---

## 2. Fichas de los referentes con peso (método, reglas, herramienta)

### 2.1 Frederick Vallaeys — Optmyzr (n.º 2 en 2026, n.º 1 en 2024)

**Quién es y por qué importa.** [H] Fue uno de los primeros empleados de Google y «AdWords Evangelist» durante ~10 años;
cofundador y CEO de **Optmyzr** (plataforma de gestión PPC, ~2013). Columnista de Search Engine Land, presentador de
**PPC Town Hall** (vídeo/podcast de Optmyzr) y del *Automation Layering Masterclass*.

**Libros.**
- *Digital Marketing in an AI World* (≈2019): cómo sobrevivir en la era de la IA; ~161 valoraciones en Amazon, 4,3.
  https://scribemedia.com/published-books/digital-marketing-in-an-ai-world
- *Unlevel the Playing Field: The Biggest Mindshift in PPC History* (enero 2022, 262 págs.). Tesis: la respuesta a la
  automatización es el **automation layering**. Reseñas: útil, pero con muchas «menciones suaves» a Optmyzr.
  https://www.goodreads.com/work/editions/94900799-unlevel-the-playing-field-the-biggest-mindshift-in-ppc-history ·
  https://apx-security-us.audible.com/pd/Unlevel-the-Playing-Field-Audiobook/B0B35BKCYW

**Método 1 — Automation layering.** [O] Poner tu propia capa de automatización (reglas, alertas, scripts) **encima**
de la de Google. Tres beneficios que él enumera: **seguridad** (un error de la plataforma tiene que pasar varios
filtros antes de hacer daño), **control** (vía API se revierten límites de la plataforma) y **visibilidad** (alertas
en tiempo real frente a los informes con retraso de Google). http://www.optmyzr.com/blog/automation-layering-ppc
- Ejemplos concretos que da: alerta si el **CPC medio supera un umbral en una ventana de tiempo**; regla que **pausa
  grupos de anuncios si el gasto pasa de X**; caso real en que Smart Bidding pujó al **500 % del CPC histórico** por un
  fallo de estacionalidad y se habría tardado horas o días en ver sin capa propia; script que revisa **URLs de destino
  con 404/500**; ajustar tCPA/tROAS por **calendario promocional, márgenes o pérdida de cuota por ranking**.
- **Fallo típico que la capa debe evitar** [O]: bajan las conversiones → la regla baja pujas, pero la causa era una
  **caída de la pasarela de pago o del etiquetado**: «reacciona al síntoma, no a la causa».
  https://www.optmyzr.com/blog/beyond-automation-blackbox-human-machine-paid-media/
- Caso [A] «Betty», prestamista hipotecaria: Smart Bidding sube formularios y bajan las hipotecas aprobadas; se
  identifican rasgos de los leads aprobados, se cambian las entradas (conversiones) → menos formularios, más cierres.
  Es exactamente el problema de calidad de lead de nuestros clientes.
- Prioridades de optimización en orden, según Optmyzr: estructura → creatividades → datos estructurados (feeds) →
  objetivos (tCPA/tROAS) → datos de conversión (offline/post-conversión).

**Método 2 — Los tres papeles del experto PPC.** [O] (entrevista Friends of Search)
https://friendsofsearch.com/be/blog/interview/interview-frederick-vallaeys-search-professionals-need-to-understand-how-they-can-collaborate-with-automation-technology-rather-than-compete-against-it/
- **Médico**: diagnostica, receta y **vigila efectos secundarios del tratamiento**; entiende cómo interactúan atribución,
  objetivos y automatizaciones.
- **Piloto**: vigila los sistemas automáticos e **interviene para evitar desastres**; sabe qué mandos tocar para ganar a
  la competencia.
- **Profesor**: entrena al aprendizaje automático con **objetivos claros y mejores datos** (conversiones offline,
  valores).
- [NV] En una columna de enero 2025 (Search Engine Land, bloqueada) añade un cuarto papel, «restaurador» (quien decide
  el menú/oferta). Solo se vio citado en un resumen de búsqueda.
- Opinión clave: PMax y Smart Shopping «encajan con anunciantes pequeños con poca pericia»; los profesionales que buscan
  el máximo rendimiento a menudo prefieren tipos con más control.

**Método 3 — IA agéntica con cambio revisado.** [O] En PPC Town Hall (oct. 2026) Optmyzr aplica a los cambios de su MCP/
agente un **modelo de «change request» de desarrollo de software**: la IA explica su razonamiento, un humano aprueba o
rechaza y queda como **dueño** del cambio; se guarda **traza de quién aprobó y la justificación**. Advierte que la IA
«se para en el primer hallazgo» y no ve información contradictoria: hay que darle el estado exacto de la cuenta.
https://www.optmyzr.com/ppctownhall/when-ai-changes-the-account-who-answers-for-it/

**Herramienta: Optmyzr.** [H] Más de una década en el mercado; reglas (Rule Engine), alertas, scripts mejorados sin
código, Campaign Automator desde feeds, auditorías, informes; estudios con decenas de miles de cuentas (ver §3).
Vínculo autor → filosofía → herramienta: **la herramienta es literalmente el «layering»** (capa de reglas encima de
Google). Optmyzr planea guardar más historial de cambios del que dan las plataformas (Microsoft Ads solo 6 meses).

### 2.2 Brad Geddes — Adalysis (n.º 9 en 2026; en todos los rankings desde 2012)

**Quién es.** [H] En PPC desde 1998; ex-director de búsqueda; formador oficial de AdWords durante años; cofundador de
**Certified Knowledge** (formación) y de **Adalysis** (software de test de anuncios y auditoría, ~2014).
**Libro**: *Advanced Google AdWords* (Sybex/Wiley; 1.ª ed. 2010, 2.ª 2012, 3.ª 2014). Era «el libro» técnico de AdWords;
hoy en buena parte **obsoleto** (posición media, ETAs, BMM). Capítulos clave: organización de cuentas (cap. 14: tres
niveles de decisión — cuántas cuentas, estructura de campañas, grupos para subir CTR y conversión), guía paso a paso
de creación y seguimiento (cap. 17). https://www.oreilly.com/library/view/advanced-google-adwordstm/9780470640739/

**Método 1 — Test de anuncios por métricas «por impresión».** [O/H]
- **CPI = conversiones / impresiones** (p. ej., 15 conv. / 10.000 impr. = 0,15 %). Mide desde la impresión, así que
  combina CTR y tasa de conversión en un solo número. https://adalysis.com/blog/inside-ad-testing-metrics-conversion-per-impression-cpi/
- **RPI / PPI** (ingresos o beneficio por impresión) para e-commerce: CPI ignora el valor.
  https://searchengineland.com/ad-testing-are-you-using-the-wrong-success-metrics-123556 (vía resumen)
- **Reglas de decisión**: objetivo «máximas conversiones» → CPI; «máximos ingresos» → RPI; si hay CPA máximo →
  **quitar primero los anuncios por encima del CPA objetivo y elegir el de mayor CPI entre el resto** (CPA/ROAS como
  filtro, no como criterio de victoria); si hay que llegar a X leads/mes al menor coste → el de menor CPA que alcance el
  volumen; si el Nivel de Calidad sufre → con conversiones parecidas, el de mayor CTR.
- **Mínimos de datos** (por impresiones): grupos de alto volumen 1.000-10.000; medio 500-1.000; bajo volumen →
  **test multi-grupo** (agregando grupos con el mismo patrón de anuncio). No poner mínimos de conversiones demasiado
  altos (ejemplo: con 500 conv./día y 3-5 anuncios, 100 conv. por anuncio). Todos los anuncios deben alcanzar el mínimo
  antes de juzgar.
- **RSA y fijación (pinning)** [O]: Geddes defiende que las pymes **fijan demasiado poco** («está perjudicando su
  marketing»); un comentarista con presupuestos pequeños añade que no pueden permitirse que Google pruebe combinaciones
  durante 90.000 impresiones. https://adalysis.com/?p=2756

**Método 2 — Nivel de Calidad descompuesto.** [NV — fórmula vista en resúmenes, artículo original bloqueado]
Ingeniería inversa sobre ~100 M$ de gasto: **QS ≈ 1 + LP + AR + eCTR**, con experiencia de página de destino y CTR
esperado = 3,5 (superior), 1,75 (media), 0 (inferior); relevancia del anuncio = 2 / 1 / 0. Conclusión práctica: **CTR
esperado y landing pesan casi el doble que la relevancia**; el QS de cuenta/campaña se calcula **ponderado por
impresiones**. https://www.acquisio.com/blog/?p=6300 · https://searchengineland.com/?p=244192
Google insiste en que el QS es **diagnóstico, no entrada de la subasta**. https://support.google.com/google-ads/answer/6167118

**Método 3 — AI Max con lupa (dic. 2025).** [O] https://adalysis.com/blog/ai-max-search-term-reporting/
- AI Max trata tus palabras **como amplias aunque sean exactas o de frase** y **se apunta conversiones que tus exactas
  ya habrían conseguido**; aparecen términos idénticos atribuidos a la exacta y a AI Max; hay términos **sin palabra
  clave asociada** (sospecha: expansión de URL).
- Su método: filtrar por tipo de concordancia AI Max; buscar marca → genérico, genérico → competidor, marca →
  competidor; **deduplicar** términos de AI Max contra los de exacta/frase (lo único que da el impacto real, «trabajo
  pesado de hoja de cálculo» que casi nadie mantiene).
- **No usar AI Max** si la amplia ya funcionó mal, si dependes de exactas/frase con **mucha cuota perdida por
  presupuesto**, o si no quieres personalización de texto ni expansión de URL. Ginny Marvin (Google) le respondió
  públicamente. https://ppc.land/google-clarifies-ai-max-attribution-discrepancies-as-advertisers-discover-search-term-reporting-anomalies/

**Método 4 — Árbol de diagnóstico de «la campaña no gasta» (2026).** [H] Causas y cómo detectarlas:
https://adalysis.com/blog/why-your-campaigns-are-underspending-and-how-to-fix-it/
cuota de impresiones ya alta (presupuesto mayor que el mercado → ampliar palabras/amplia/AI Max); **impresiones muy por
debajo de la estimación del Planificador** (negativas bloqueando consultas esenciales); audiencias negativas que se
solapan con el público; horario restrictivo; audiencia en «segmentación» en vez de «observación»; exclusiones
demográficas; ubicaciones bloqueadas o sin «interés en»; **ad rank bajo** (QS bajo, sobre todo CTR esperado → test por
CPI); **tope de puja de cartera demasiado bajo**; campaña nueva sin historial con tCPA (pasar a estrategia menos
dependiente de datos); fallos estructurales (grupos sin palabras o anuncios, conflictos de negativas, rechazos); **PMax
canibalizando Search** (Search baja mientras PMax crece, términos solapados → añadir los mejores como exacta).

**Método 5 — Fijación (pinning) con datos (5.900 cuentas, 2026).** [H, proveedor] RSAs ≥30 días, ≥250 impr., ≥1 conv.:
69 % de los RSAs sin fijar usan los 15 titulares; ~15 % fija las tres posiciones; **más fijación → algo menos de CTR
pero más conversión y más CPI** (en parte porque quien fija todo también testea más). Recomendación: palabra clave en
posición 1, CTA/beneficio en posición 2; si fijas las tres, gestiona tests activamente; si no, fija 1-2 y deja el resto
a Google. https://adalysis.com/blog/data-study-5900-accounts-rsa-pinning/ (Matiz frente al estudio de Optmyzr 2024,
que encontró peor conversión con todo fijado: **los datos de proveedores se contradicen**.)

**Método 6 — LLMs sobre datos de Ads (nov. 2026).** [H/O] Probó ChatGPT y Claude vía la MCP de Adalysis: cifras
correctas casi siempre, pero **errores de fórmula (CPA invertido) y de separador decimal que multiplican un presupuesto
×100**; sin fecha en la pregunta, cada modelo elige un periodo distinto; gráficos engañosos (ejes que saltan de 10 a
10.000); Claude agrupa el plan por tipo de campaña (como trabaja un equipo) y aprovechó una alerta desactivada que
ChatGPT pasó por alto; Gemini más genérico («sube pujas o presupuesto»). Hábitos: **fecha explícita en cada consulta,
comprobar fórmulas, pujas y presupuestos antes de dejar actuar al asistente**.
https://adalysis.com/blog/chatgpt-or-claude-for-google-ads-analysis/

**Herramienta: Adalysis.** [H] **100+ comprobaciones de auditoría diarias** en Google y Microsoft Ads, clasificadas en
**Críticas / Errores / Recomendaciones**; umbrales ajustables, comprobaciones desactivables o personalizadas,
**auto-resolución** opcional de lo rutinario; ranking de grupos por **QS ponderado por impresiones × coste a 30 días**;
test de anuncios con significancia (incluido multi-grupo). https://adalysis.com/ppc-audits-rule-engine/ ·
https://docs.adalysis.com/tools/audit/audit-overview
Vínculo: el método de test por impresión y el QS ponderado **son** las pantallas centrales de la herramienta.

### 2.3 Kirk Williams — ZATO (n.º 4 en 2026 y 2024)

**Quién es.** [H] Dueño de **ZATO**, micro-agencia PPC centrada en Shopping/e-commerce (desde 2009 en marketing).
Libro *Ponderings of a PPC Professional* (atribución, segmentación, puja automática con capítulo «Bidding Rules Rule»,
precios de agencia, cómo evitar malos clientes); podcast *PPC Ponderings*.
https://blueberry-armadillo-nrag.squarespace.com/tools-and-resources/book-review-ponderings-of-a-ppc-professional-by-kirk-williams

**Ideas y método.** [O]
- **«De-frenzy PPC»**: el PPC no tiene por qué ser caótico; identifica 7 causas de frenesí (las dos primeras: errores y
  mala planificación). Su agencia tiene un «sustito» al año. https://searchengineland.com/ppc-frenzy-387815 (vía resumen)
- **Escepticismo con PMax**: «Nunca hemos visto a PMax rendir de forma tan consistentemente peor como al entrar en 2025»;
  mueve presupuesto a Search y Shopping estándar donde los números lo apoyan.
  https://smarter-ecommerce.com/blog/en/google-ads/state-of-performance-max-campaigns-2025/
- **Informe de canales de PMax como hipótesis**, no como verdad: después, test separado con presupuesto propio. PMax
  persigue conversiones dentro de tu presupuesto/objetivo; puede saltarse YouTube si hay ventas fáciles de Shopping.
- **Atribución**: mirar más allá del último clic; los anuncios identifican y alcanzan gente pero no venden solos.
- **Agencias en la era IA**: dos caminos — operadores comoditizados que usan IA para cobrar menos, o estrategas premium
  que **montan y diagnostican cuando la automatización falla** (más difícil de diagnosticar); más proyectos, auditorías y
  retainers pequeños; **producto barato para presupuestos pequeños** con exclusiones claras.
  https://www.optmyzr.com/ppc-town-hall/how-agencies-can-thrive-in-the-age-of-ai/
- **Responsabilidad**: «No puedo hacer responsable a Claude»; si un agente de la agencia comete un error caro, el cliente
  demanda a la agencia. Prefiere **comprar herramientas maduras** a construir de cero; construye un «ZATO brain» (SOPs,
  info de clientes, vigilancia de objetivos) sobre todo administrativo.
  https://www.optmyzr.com/ppctownhall/when-ai-changes-the-account-who-answers-for-it/
- Flujo con IA para feeds: la IA lee la página de producto y las reseñas y extrae lenguaje del cliente para títulos.

**Herramienta**: no tiene software propio comercial. Encaja con su filosofía (comprar en vez de construir).

### 2.4 Nils Rooijmans — scripts (n.º 5 en 2026, 10 en 2024)

**Quién es.** [H] ~20 años en búsqueda de pago; agencia remota; **el referente de los Google Ads scripts**; mantiene
una lista de **400+ scripts** y una newsletter diaria. Dice que los scripts hacen la mayor parte del trabajo de su
agencia («el doble de eficientes», «3× beneficios» — [O] autodeclarado). Frase: PMax **maximiza tu gasto, no tu
beneficio**. https://www.nilsrooijmans.com/

**Su catálogo es, de facto, una lista de vigilancias** (todos gratis): alertas de sobre-entrega del presupuesto diario,
**variantes cercanas** (close variants), **conflictos de negativas**, n-gramas de términos, **CPC máximo alto**,
**redirecciones** de URLs, **ROAS de socios de búsqueda**, productos y anuncios rechazados, **historial de infracciones**,
grupos sin RSA, **términos en tendencia**, categorías de búsqueda en tendencia y términos sin conversión en PMax,
sugerencias de exclusión de ubicaciones en PMax, gasto mensual frente a objetivo, **alertas del historial de cambios**,
sugerencias de negativas y **ratio Lin-Rodnitzky**.

**Reglas concretas.** [H — leídas en el código/artículo]
- **Ratio Lin-Rodnitzky** = CPA de todos los términos / CPA de los términos con ≥1 conversión (ventana 28 días, diario,
  180 días hacia atrás la primera vez). Rangos de sus inventores: **1,0-1,5 demasiado conservador** (solo marca/muy
  específico, se pierden conversiones), **1,5-2,0 bien gestionado**, **2,0-2,5 demasiado agresivo** (amplia sin vigilar),
  **>2,5 mal gestionado**. Rooijmans: 1,5-2,5 sano. https://nilsrooijmans.com/google-ads-script-lin-rodnitzky-ratio/
- **Sugerencia de negativas**: término con **>60 clics, >5 (moneda) de coste y <0,5 conversiones en 90 días**, que no
  esté ya bloqueado por negativas de grupo, campaña o listas compartidas (respetando reglas de amplia/frase/exacta).
  https://nilsrooijmans.com/google-ads-script-negative-keyword-suggestions/
  (Nota técnica: el `ORDER BY` del script va detrás de un punto y coma y no se aplica.)

**Agentes de IA — su postura (ago. 2026).** [O] https://www.optmyzr.com/ppctownhall/can-ai-agents-really-manage-google-ads-accounts/
- Los agentes son «**becarios con una confianza aterradora**»; no les deja tocar una cuenta real sin supervisión hasta
  haber mapeado dónde se equivocan.
- Funciona: **juez LLM de intención** para términos de búsqueda (sin esperar a N clics sin conversión); **acción con
  umbral de confianza: ≥85 % → añade la negativa y la registra; por debajo, espera a un humano**; un agente = una tarea;
  **preprocesado determinista** (scripts) para que el LLM solo vea lo que necesita juicio; correcciones humanas en una
  hoja compartida que mejoran la confianza futura; elegir modelo según dificultad; modelos abiertos en servidor propio
  para que los datos no salgan.
- Ejemplo: seguro de coche con CPC de 50-70 $: un script que espere 100 clics habría quemado **~7.000 $** antes de
  negativizar «oficina local» o marcas de la competencia; el juez LLM lo marcó bien pero **falló con «coche barato»**
  (el cliente sí asegura coches baratos) → necesita contexto del cliente.
- Falla: conocimiento genérico y desactualizado (p. ej. límites de puja en carteras), escalar muchos agentes, mantener
  al día las fichas de cliente; desconfía de PMax porque Smart Bidding necesita gasto en clics para aprender.

### 2.5 Mike Rhodes — scripts + IA (n.º 7 en 2026)

**Quién es.** [H] Australiano; construyó y **vendió una gran agencia de Google Ads**; coautor de la 6.ª ed. de
*Ultimate Guide to Google Ads* (con Perry Marshall y Bryan Todd). Combina Google Ads e IA desde 2018.
https://mikerhodes.com.au/

**Marco de las 4C** (progresión de scripts). [H] https://mikerhodes.com.au/4cs
1. **Check** (detectar): p. ej. alerta de campañas activas con **0 impresiones ayer**.
2. **Chart** (visualizar): exportar 30 días de métricas a una hoja.
3. **Change** (actuar con reglas): p. ej. **pausar campañas que ayer gastaron más de 2× su presupuesto diario**
   (multiplicador configurable, con modo vista previa).
4. **Cognition** (IA): enviar los datos de ayer a un LLM que devuelve recomendaciones y registrarlas.

**Herramientas.** [H] https://mikerhodes.com.au/agent
- **8020agent** (gratis hasta 5 cuentas; completo con sus cursos): un script de ~5.000 líneas vuelca datos **cada hora**
  a la hoja del usuario; la app lee la hoja (no guarda datos de rendimiento). Módulos: palabras y términos con
  **n-gramas** 1-3, tendencias, **Quick Wins** (socios de búsqueda, Display dentro de Search, caídas de rendimiento,
  segmentación geográfica, grupos vacíos, anuncios rechazados), productos en **6 cubos** (Rentables, Costosos,
  «Flukes», «Meh», Cero conversiones, Zombis), ubicaciones, assets, horas, y **optimización de presupuesto** con curvas de
  beneficio (~200 puntos por campaña con 30 días de coste/ingreso, apunta a la banda del 95 % del beneficio máximo,
  usando **CPA o ROAS de equilibrio**). IA con la clave del usuario (Gemini/Claude/ChatGPT).
- Scripts de pago (PMax 199 $, MCC 399 $, negativas), comunidad **AdsToAI** (~799 €/año), «Build The Agent», 8020brain.
- Vínculo: del «Check → Cognition» a un agente; su filosofía es **«construye sistemas, no solo campañas»** y medir en
  beneficio, no en ROAS.

### 2.6 Mike Ryan — Smarter Ecommerce / smec (n.º 8 en 2026)

**Quién es.** [H] Head of Ecommerce Insights de **smec** (Austria; software de pujas/PMax para retail). Publica los
estudios de datos más citados de PMax y AI Max. Su analogía de control (vía Optmyzr): **navegación** (objetivos y
presupuestos), **volante** (palabras, horarios, modificadores), **acelerador y freno** (pujas), con el humano más o
menos «en el bucle». http://www.optmyzr.com/blog/automation-layering-ppc

**Datos y reglas** [H, datos de smec]:
- **State of PMax 2025** (4.000+ campañas): PMax tocó techo de ~82 % del gasto retail en mayo 2024 y pierde ~0,65 pp/mes;
  **74-97 % del coste de PMax va a anuncios de feed** (mediana 90 %); **mínimo 30 conv./mes por campaña, ideal 60+**;
  PMax suele lograr el 95-116 % de su ROAS objetivo; sin objetivo de ROAS, más volatilidad.
  https://smarter-ecommerce.com/blog/en/google-ads/state-of-performance-max-campaigns-2025/
- **AI Max** (250+ campañas Search): mediana **+13 % valor de conversión, CPA +16 %**, ROAS mediano 0 % con rango de
  +42 % a −35 % («cara o cruz»); duda de la incrementalidad. AI Max coincidió con palabras **amplias el 49-63 % de las
  veces** en algunas cuentas; los **socios de búsqueda** suelen ser 3-8 % de impresiones, pero hubo una campaña con
  conversión 0,07 % en socios frente a 3,04 % en la red principal. Google ha dicho que AI Max sustituirá a DSA.
  https://smarter-ecommerce.com/blog/en/google-ads/the-ultimate-guide-to-ai-max-for-google-search/
- **Cambio del 17 ago 2026**: Google dejó de **suprimir pujas en campañas tROAS limitadas por presupuesto**. Antes el 55 %
  de ellas superaba su ROAS (mediana +20 %); en ~3 semanas el exceso cayó a ~0 %; **CPC mediano +15,8 %** (no limitadas
  −13 %); cuota de impresiones mediana 40 % → 31 %; pérdida por ranking 45 % → ~30 % y por presupuesto 4 % → ~33 %.
  Recomendaciones: acercar el tROAS a lo que realmente necesitas, subir presupuesto, o pasar a Maximizar conversiones.
  https://smarter-ecommerce.com/blog/en/google-ads/google-ends-its-bid-suppression-era-what-it-means-for-your-roas/ ·
  https://smarter-ecommerce.com/blog/en/google-ads/budget-limited-campaigns-after-august-17-the-roas-data/
- No sobre-segmentar por margen (poco volumen = ROAS impreciso); mirar valor por clic, no CPC; contrastar con el backend.

### 2.7 Andrew Lolk — savvyrevenue (n.º 14 en 2026)

**Quién es.** [H] Dinamarca; agencia e-commerce; canal «Andrew Talks PPC». Muy práctico y con **procesos publicados**.

**Rutina diaria de 15 minutos** (comprobar que nada está roto, **no** optimizar). [H]
https://savvyrevenue.com/blog/google-ads-daily-check/
- Mira: clics, coste, CPC de **ayer frente a anteayer** (datos ya finales); KPI de negocio (ingresos, ROAS combinado,
  margen); estado: facturación, rechazos. **No mira** conversiones (llegan con retraso), términos (un día no dice nada)
  ni presupuestos (tarea aparte).
- Disparadores: **gasto de una campaña +140 % frente al día anterior**, o **campaña que deja de gastar**; pico de
  rechazos en Merchant Center; coste de venta sobre el objetivo (ejemplo: objetivo <15 %).
- **No arreglar nada durante la revisión**: crear tarea y seguir (si no, 15 min se vuelven 1 h y se deja de hacer).
- A escala: script que exporta clics/coste/CPC de ayer y resalta **cambios >50 % día a día**. Entrar en la cuenta real:
  un panel esconde cosas (p. ej., marca gastando de más porque se pausó la genérica).

**Marco de auditoría** (100+ auditorías e-commerce). [H] https://savvyrevenue.com/blog/google-ads-audit/
- **Propósito primero** (escalar ingresos, eficiencia ROAS, exposición o eliminar desperdicio) y **fundamentos antes
  que nada**: por qué el objetivo es el que es, valor de conversión «incluido», cambios de etiquetado que expliquen una
  caída, doble conteo Analytics + etiqueta, banner de cookies, presupuesto limitante, audiencias en «segmentación» en
  vez de «observación», **nombres de campaña que contradicen su concordancia**.
- Orden: global (objetivo y si se cumple) → medición → pujas y presupuesto (exclusiones de datos, ajustes de
  estacionalidad) → Search (estructura, anuncios y landings, palabras por fase del embudo, concordancias, DSA, términos,
  **cadencia de optimización**) → Shopping → feed → Display/YouTube → acciones.
- Reglas: **no basar sugerencias en campañas de poco gasto**; ~50-70 % de hallazgos son estándar en toda auditoría; está
  bien no encontrar nada; decir también lo que debe quedarse igual.

**Cinco errores más vistos (50+ auditorías).** [H/O] https://savvyrevenue.com/blog/google-ads-mistakes/
1. Tomar el ROAS de la plataforma como verdad (objetivos sin revisar en **2-4 años** = bandera roja).
2. Gestión reactiva de rebajas (Smart Bidding tarda **2-3 días** en corregir tras un pico).
3. Sobre-segmentar: Google sugiere 30-50 conv./campaña/mes; **él pide ≥100**; la sobre-segmentación cuesta 10-20 %.
4. Mezclar marca y no-marca (la marca infla el ROAS; ejemplo: marca a 5,5× ocultaba no-marca a 2,2×).
5. Divisiones sin diferencia real (0,3 pp de diferencia de conversión con 800 conv./mes = ruido); revisar setups a los
   ~3 meses.

**Estructura de Search moderna.** [O] https://savvyrevenue.com/blog/search-campaign-structure/ — pocas palabras y
grupos; **solo crear un grupo si vas a escribir un anuncio realmente distinto**; exacta = grupo de control, frase =
descubrir, amplia solo para escalar si el margen lo permite; titulares RSA con **ángulos asignados por posición**;
cuatro señales de audiencia propias (visitantes, convertidores, suscriptores, clientes).

**Auditoría PMax en 3 pasos.** [H] https://savvyrevenue.com/blog/performance-max-audit/ — (1) informe de **canales**:
**>10 % del gasto en Display/Vídeo = bandera roja** en e-commerce; segmentar por «anuncios con datos de producto»;
(2) términos: localizar la marca (conversión/ROAS anómalo) y sacarla; (3) titulares: quitar los de **CTR muy bajo con
muchas impresiones** (ej. 0,4 %) y los de buen CTR y mala conversión.

### 2.8 Jyll Saskin Gales — Inside Google Ads (n.º 1 en 2026)

**Quién es.** [H] **6 años en Google** (formación/ventas a agencias); coach independiente; fundadora de PPC Zone.
**Libro**: *Inside Google Ads: Everything you need to know about Audience Targeting* (n.º 1 en su categoría en Amazon).
**Curso** Inside Google Ads (100+ lecciones, 79 $/mes, «JyllBot»), conferencia propia en Toronto (oct. 2026), podcast.
https://www.insidegoogleads.com/ · https://jyll.ca/book
- Su posición: **trabajar con la plataforma, no contra ella**, entendiendo por qué Google cambia cada cosa. Es la voz
  más «pro-Google» del top (ex-empleada).
- Serie 2025 en Search Engine Land sobre cada estrategia de puja (Maximizar conversiones, tCPA, Maximizar valor, tROAS,
  Maximizar clics, Cuota de impresiones objetivo), exacta, y «**PMax: la verdad sobre señales de audiencia y temas de
  búsqueda**» (oct. 2025). **[NV]** Contenido no legible (403); solo títulos en https://jyll.ca/writer.
- **[NV]** Del libro no se pudo leer el índice; por su título y reseñas trata observación vs. segmentación, segmentos
  personalizados, remarketing, señales de audiencia.

### 2.9 Perry Marshall — *Ultimate Guide to Google Ads* (clásico)

[H] El libro más vendido de la historia de AdWords para pymes (desde 2006; 6.ª ed. con Mike Rhodes y Bryan Todd).
Idea central: **relevancia = «message-to-market match»**: anuncio y landing tienen que coincidir con lo que busca la
persona; los anuncios con más clics consiguen mejor posición por menos dinero; pujar más no garantiza ganar.
https://www.perrymarshall.com/?p=39486. Popularizó el 80/20 aplicado al PPC (el 20 % de palabras da el 80 % del
resultado) y el **split-testing** constante de anuncios. **[NV]** Tácticas como «peel & stick» (aislar palabras en
grupos propios, antecedente de los SKAG) no se pudieron confirmar en una fuente primaria. Hoy su valor es la
**mentalidad de respuesta directa**, no la mecánica (gran parte obsoleta: SKAGs, pujas manuales por palabra).

### 2.10 Ed Leake — God Tier Ads (n.º 15 en 2026, 5 en 2024)

[H] Británico; agencia Midas Media; antes AdEvolver (herramienta). Vende el **Performance Framework**: «sistema operativo
de Google Ads» con **400+ pasos, checklists, SOPs, plantillas y scripts**, pago único, 200+ actualizaciones desde 2020.
Principios: «**el oficio por encima de los trucos**» («los trucos mueren, los marcos sobreviven»), hecho sobre cuentas
reales. Nuevo **Athena AI Assistant**: vigila cuentas, **publica un resumen el lunes en Slack**, marca anomalías,
audita la estrategia de puja, «desintoxica» palabras; corre en el Google Cloud del usuario; **acciones siempre con
aprobación humana**. https://godtierads.com/ — Vínculo: checklist → SOP → agente que ejecuta la checklist.

### 2.11 Amy Hebdon — Paid Search Magic (n.º 11 en 2026)

[H] Cofundadora con James Hebdon; coaching y cursos. **MAGIC Framework** (no se pudieron leer sus componentes [NV]) y
curso **Magnetic RSAs** (32 lecciones, proceso repetible para escribir RSAs que convierten).
https://paidsearchmagic.podia.com/ — Su sello: **el anuncio y la landing desde la mente del buscador** (intención,
objeciones), lo que los automatismos no hacen bien. Kirk Williams la recomienda para uso avanzado de IA en PPC.

### 2.12 Martin Röttgerding — Bloofusion (Alemania)

[H] Blog *PPC Epiphany*. Su serie **«Debunking Ad Testing»** es la crítica más rigurosa al test A/B clásico:
https://www.ppc-epiphany.com/2018/10/23/debunking-ad-testing-part-1-statistical-significance/
- 444 tests sin tocar un año: **~70 % alcanzó el 95 % de significancia en algún momento, solo 45 % al final**.
- 576 **tests A/A** (anuncios idénticos): el **55 %** de los que tenían ≥1.000 impresiones fue «significativo» alguna
  vez, **81 % a 100.000 impresiones** → más datos, más falsos ganadores si miras repetidamente.
- Parte 2 (6.500 parejas de anuncios): en el **32,7 %** de los tests el ganador global de CTR **perdía en Google** (red
  principal) — efecto de los socios de búsqueda (paradoja de Simpson); en el **6,3 %** el ganador global perdía **tanto
  arriba como en el resto de posiciones**. Recomendación: juzgar anuncios **solo con datos de la red de Google** y
  **segmentar por posición (parte superior / resto)**.
  https://www.ppc-epiphany.com/2018/12/03/debunking-ad-testing-part-2-garbage-in-garbage-out/
- Conclusión: **parar un test al ver «95 %» es un error** (problema de mirar repetidamente, «peeking»). El CTR no mide
  solo el anuncio: depende del contexto y de qué más hay en la página.
  https://www.ppc-epiphany.com/2019/03/06/debunking-ad-testing-part-3-the-small-picture/
- Autor del clásico «Quality Score Tracker» (script) y de análisis de posiciones exactas.

### 2.13 Menachem Ani — JXT Group (n.º 13 en 2024) · el más útil para **lead gen**

[H] Guías de practicante 2026 con reglas muy concretas para lead gen (nuestro caso):
https://www.jxtgroup.com/performance-max-for-lead-generation/
- PMax de leads **solo cuando Search ya convierte y conoces tu coste por lead cualificado**; hace falta CRM con estados.
- Conversiones: separar la acción online (formulario/llamada) de cada **etapa offline** (Lead cualificado, Convertido);
  contar una por clic; **enhanced conversions for leads**; **importación diaria** (con GCLID y hora real); la nueva acción
  como **secundaria 2-3 semanas**; un responsable de las subidas («si se paran, la puja deriva»).
- Pujar a **una sola etapa primaria** (normalmente Lead cualificado). Valores parecidos → Maximizar conversiones con tCPA
  ≈ lo máximo que pagarías por lead cualificado; valores distintos → valor por etapa (**ticket medio × tasa de cierre**)
  y Maximizar valor; tROAS solo cuando los valores son estables; no cambiar valores cada semana.
- Controles: PMax **junto a** Search; ubicación **«presencia»**; exclusión de marca (marca en Search aparte); **expansión
  de URL desactivada**; un grupo de recursos por servicio; hasta 50 temas de búsqueda; negativas «empleo, trabajo,
  gratis, DIY/hazlo tú mismo».
- **Spam**: reCAPTCHA invisible o *honeypot*, validación en servidor antes de disparar la conversión, 1-2 preguntas
  cualificadoras, revisar ubicaciones basura. Servicios a domicilio: **contar llamadas solo por encima de una duración**.
- **Evaluación**: coste por lead cualificado y tasa de cualificación con el CRM como verdad; **si PMax sube lo mismo que
  baja Search, solo has movido leads** (canibalización); ventana suficiente para que llegue la cualificación; nada en la
  primera semana. Errores típicos: pujar a formularios brutos, varias etapas a la vez, subir offline **mensualmente**,
  tCPA calculado sobre coste por formulario.
- **AI Max** (https://www.jxtgroup.com/how-to-use-ai-max-for-search-campaigns/): solo en **no-marca ya rentable con
  Smart Bidding** y **no limitada por presupuesto** (Google dice que así «no será efectivo»); no con CPC manual; probar
  como **experimento 50/50 durante 4-6 semanas**, decidiendo por separado los 3 interruptores; exclusiones de URL
  (empleo, blog, privacidad, login); vigilar la columna «Seleccionado por» de landings; parámetro
  `{search_term_matchtype}` = «a» para medir AI Max en el CRM. **[NV, verificar en Google]**: creación de DSA nuevos
  termina en **enero 2027** y migración automática a AI Max desde **febrero 2027**.

### 2.14 Igor Ivitskiy — Ivitskiy Ads Lab (n.º 6 en 2026, Ucrania)

[H] Blog dirigido a **dueños de negocio** (qué cuesta un clic, dónde se pierde el dinero), libro *19 Google Ads Secrets*,
producto «Profit Forensics»; mucho caso local (talleres, clínicas, llamadas y «cómo llegar» en Maps).
https://ivitskiy.com/blog/en/
- **Revisión del historial de cambios** (útil como vigilancia de agencia): cruzar cambios de presupuesto/puja/estado con
  el día en que los leads subieron o bajaron; identificar cambios de API/Editor/reglas; **ritmo de ediciones muy por
  encima de lo normal sin mejora de leads** (caso: ~20× durante 3 meses) = bandera roja; ráfaga de cambios seguida de
  silencio; usuarios desconocidos con acceso. Historial = 2 años; deshacer = 30 días.
  https://ivitskiy.com/blog/en/google-ads-change-history/

### 2.15 Otros con peso (fichas breves)

- **Navah Hopkins** (Microsoft Ads Product Liaison; antes Optmyzr, autora de sus estudios 2024 — ver §3). Defensora de
  Maximizar valor: en un caso, 19.537 € frente a 5.116 € con Maximizar conversiones.
- **Aaron Levy** (Optmyzr; antes Tinuiti; n.º 26 en 2026): copresenta PPC Town Hall; foco en estructura y procesos de
  agencia.
- **Greg Finn** (Cypress North; podcast *Marketing O'Clock*): para lead gen con PMax, «la **calidad de la conversión**
  debe ser el foco»; exclusiones de marca y negativas.
- **Isaac Rudansky y Patrick Gilbert** (AdVenture Media, Nueva York): Rudansky tiene uno de los cursos de Google Ads más
  vendidos de Udemy **[NV: cifras]**; Gilbert escribió *Join or Die* (la máquina es «un amigo que necesita tu guía»).
- **Kasim Aslam** (Solutions 8; n.º 2 en 2024): agencia Google Partner grande; podcast; **[NV]** libro de Google Ads.
- **Julie Friedman Bacchini** (Neptune Moon; fundadora del chat semanal **#PPCChat**): voz de la comunidad y de las
  cuentas pequeñas; su web no se pudo leer.
- **Andrea Cruz** (Monks; B2B y lead gen), **Joe Martinez y Michelle Morgan** (Paid Media Pros, vídeo), **Duane Brown**
  (Take Some Risk), **Sam Tomlinson / Susan Wenograd** (Warschawski), **Ameet Khabra** (Hop Skip Media).
- **Europa continental**: **Miles McNair y Bob Meijer** (PPC Mastery, NL; Meijer: PMax «no es mi tipo de campaña de
  referencia», úsala como capa «atrápalo-todo» junto a campañas con control); **Thomas Eccel** (AdSea; PMax captura
  demanda, Demand Gen la crea); **Benjamin Wenner** (Alemania; agentes PPC reales, ver §4); **Boris Beceric**
  (Alemania, coaching); **Gianpaolo Lorusso** (Italia, ADworld Experience, libro *Agile Google Ads*); **Frederik Boysen**
  (Profitmetrics, Dinamarca: pujar a beneficio — POAS); **Wijnand Meijer** (TrueClicks, NL: auditoría a escala de MCC).
- **Brett Bodofsky** (Zimmerman Advertising; Top 100): conocido por consejos tácticos en LinkedIn; no se leyó material
  propio **[NV]**.

---

## 3. Datos de estudios a gran escala firmados por referentes (para calibrar umbrales)

Todos de Optmyzr (proveedor: posible sesgo de muestra hacia anunciantes avanzados; son correlaciones).

| Estudio | Hallazgo clave | Fuente |
|---|---|---|
| Estrategias de puja (14.584 cuentas, 2024) | Maximizar valor gana a Maximizar conversiones en ROAS/CPA/CPC; **≥50 conv./30 días** = umbral de Smart Bidding predecible, <25 peor; los **objetivos (tCPA/tROAS) más a menudo empeoran que mejoran**; si se ponen, ±10 % del histórico; 2-3 semanas de asentamiento tras cambios grandes de presupuesto; punto óptimo 10-50 k$/mes; en lead gen, Maximizar valor +~300 % ROAS vs Maximizar conversiones | https://www.optmyzr.com/blog/impact-of-ppc-bidding-strategies/ |
| Concordancias (2.637 cuentas, datos 2023) | Exacta mejor ROAS en el **72,5 %** de cuentas y mejor CPA en el 70,8 %; brecha mayor por encima de 10 k$/mes; amplia solo gana en impresiones; usar amplia para descubrir datos y negativas, no por clics baratos | https://www.optmyzr.com/blog/optmyzr-study-broad-match-bidding/ |
| Ad Strength (1M+ anuncios, 2024) | **Sin correlación** con rendimiento; RSAs «Media» con mejor CPA/conversión/ROAS; fijar algo gana ligeramente en CPA/ROAS; fijar todo empeora la conversión; titulares cortos y sentence case | https://www.optmyzr.com/blog/google-ad-strength-study/ |
| PMax (9.199 cuentas, 2024) | Mejor ROAS con **varias campañas de 1 grupo de recursos**; señales de audiencia y temas de búsqueda **no aportan** apenas; solo 3 % usa exclusión de marca; ≥60 conv./30 días; no usar PMax en piloto automático | https://www.optmyzr.com/blog/performance-max-study/ |
| Optimization Score (17.380 cuentas) | 80+ correlaciona con mejor CPA/ROAS, pero **95 % de cuentas no aceptó recomendaciones**; las aceptadas eran de higiene (negativas en conflicto, assets que faltan) | https://www.optmyzr.com/blog/does-optimization-score-affect-google-ads-performance/ |
| Trabajo manual (72.358 cuentas, feb-jul 2026) | 10,8 % de los cambios aún a mano; **~90 % son de segmentación** (palabras, negativas); presupuesto = la tarea más repetida; motivo para no automatizar: **40 % no se fía** con presupuestos de clientes | https://www.optmyzr.com/blog/google-ads-manual-work-study/ |

---

## 4. Lo que dicen los referentes sobre **agentes de IA gestionando cuentas** (2026)

Muy relevante porque es lo que vamos a construir.

- **Benjamin Wenner** (Alemania, 2-3 años con agentes en cuentas reales): orquestador con contexto de negocio
  (márgenes, objetivos) + capa de datos + funciones especializadas; **~140 funciones creadas, solo ~30 sirven en
  producción**; **más de 10-12 funciones → inestable** (alucinaciones, timeouts); **el razonamiento registrado no
  coincidía con los cambios hechos**; hace falta una **capa de esquema** que defina qué es cada dato y para qué sirve;
  las actualizaciones de modelo cambian el comportamiento con los mismos datos; **solo lectura primero**; las pujas y el
  presupuesto con humano. «Es más un proyecto de base de datos e infraestructura que de scripts».
  https://www.optmyzr.com/ppctownhall/what-agentic-ppc-actually-looks-like-in-practice/
- **Nils Rooijmans**: umbral de confianza 85 %, un agente por tarea, determinista antes de LLM (ver 2.4).
- **Vallaeys / Optmyzr**: cambio como «pull request» con revisor y traza; la MCP debería **traer reglas de negocio**
  (marcar cambios demasiado frecuentes o palabras en conflicto), no solo datos.
- **Kirk Williams**: la responsabilidad es de la agencia; comprar herramientas maduras; IA para lo administrativo.
- **Ed Leake** (Athena) y **Mike Rhodes** (8020agent): resumen semanal + anomalías + auditoría, **acción con
  aprobación humana**.
- Riesgos citados: baneos de cuentas por automatización no oficial (casos en Meta con MCP de terceros), cambios
  demasiado frecuentes (scripts que cambiaban pujas cada hora y dispararon el gasto), anuncios generados que violan
  políticas.

---

## 5. Referentes en español (España y Latinoamérica)

**Hallazgo principal [H]**: en los rankings internacionales casi no hay hispanohablantes — **una española en el Top 100
2026 (Ana Kostic, bigmomo, agencia SEO/SEM desde 2014)** y ninguno en el Top 50. https://bigmomo.com/
No se encontró ningún libro en español con un método propio de Google Ads comparable a Geddes o Vallaeys.

Divulgadores con alcance real (formación, no método publicado):
- **Juan Lombana** (Mercatitlán; probablemente México [inferido]): entró en Google con 19 años, después «Google Expert»;
  Entrepreneur lo llamó «el gurú de Google Ads»; libro *Click, Swipe, Tap Tap*; comunidad grande en LatAm (~270 k en
  Facebook, ~380 k en Instagram). https://www.mercatitlan.com/juan-lombana
- **Joan Boluda** (España, boluda.com): academia por suscripción (~10 €/mes) con cursos de Google Ads básico,
  intermedio (optimización, landing, calidad, conversiones), certificaciones, **negocios locales** y YouTube Ads.
  https://boluda.com/
- **[NV]** Otros nombres que suenan en España (consultores freelance, ponentes de congresos de marketing) no se pudieron
  verificar por falta de búsquedas. Pendiente para el investigador de comunidad (07) o una segunda pasada.

**Implicación**: el estado del arte es anglosajón/neerlandés. Un módulo que aplique en español los métodos de §2 (con
umbrales explícitos y explicaciones del porqué) **no tiene competencia local conocida**.

---

## 6. Puntos de acuerdo y de desacuerdo

### 6.1 Acuerdo amplio (casi unánime)
1. **La medición manda**: sin conversiones correctas y con valor (CRM, lead cualificado, beneficio), la automatización
   optimiza lo equivocado (Vallaeys «Betty», Lolk «fundamentos primero», Ani, Rooijmans «descubrimiento del cliente»).
2. **El humano define el objetivo y vigila**; la máquina ejecuta (médico/piloto/profesor; layering; 4C).
3. **Separar marca de no-marca** (Lolk, Ani, Geddes, Finn, Optmyzr: solo 3 % usa exclusión de marca en PMax).
4. **Volumen mínimo para Smart Bidding**: 30 (Google) / 50 (Optmyzr) / 60 (smec, PMax) / 100 (Lolk) conversiones al mes
   por campaña. Debajo: consolidar o pujar por clics/manual.
5. **Consolidar más que fragmentar** (Lolk, smec, Optmyzr): la era SKAG terminó; un grupo nuevo solo si el anuncio es
   realmente distinto.
6. **No fiarse del ROAS/conversiones de la plataforma** sin cruzarlo con el backend (Lolk, Ryan, Mariani, Ani).
7. **Ad Strength y Optimization Score no son objetivos**.
8. **Agentes: solo lectura → sugerencias → acción con aprobación y registro**.

### 6.2 Desacuerdos

| Tema | Más a favor | Más en contra / con cautela |
|---|---|---|
| **PMax** | Jyll Saskin Gales (trabajar con la plataforma); Navah Hopkins (con Maximizar valor) | Kirk Williams («peor que nunca en 2025»), Rooijmans («maximiza gasto, no beneficio»), Bob Meijer, Vallaeys (mejor para pequeños sin pericia), Lolk (escéptico declarado) |
| **AI Max** | Google (+14 %/+27 %); casos de Google (L'Oréal Chile, MyConnect) | Geddes (se apunta conversiones ajenas), smec («cara o cruz»), Monks (99 % de impresiones sin conversión en 30.000 términos); Ani: solo en no-marca rentable y no limitada |
| **Concordancia amplia + Smart Bidding** | Google, Gales | Optmyzr 2023 (exacta gana en 7 de cada 10 cuentas), Lolk (amplia solo para escalar con margen) |
| **Poner objetivo tCPA/tROAS** | smec (con objetivo, menos volatilidad en PMax) | Optmyzr 2024 (los objetivos más a menudo empeoran; si se ponen, ±10 %) |
| **Test de anuncios en era RSA** | Geddes (test por impresión, pinning para pymes) | Röttgerding (la significancia «mirada» es engañosa); Optmyzr (fijar todo baja la conversión) |
| **Cuánto control manual** | Vallaeys/Rooijmans: capa propia de reglas y scripts | Gales/Gilbert: guiar a la máquina con entradas, no frenarla |
| **Construir o comprar agentes** | Rhodes, Rooijmans, Wenner (construyen) | Kirk Williams (compra herramientas maduras) |
| **Negativas: por números o por intención** | Rooijmans clásico (umbral de clics/coste) | Rooijmans 2026 (juez LLM: evita quemar 7.000 $ esperando 100 clics) — ambos conviven |

---

## Ideas para nuestro módulo

1. **Arquitectura «layering» explícita**: el agente es nuestra capa encima de Google. Cada vigilancia debe tener
   (a) umbral determinista, (b) diagnóstico con causas candidatas, (c) propuesta, (d) quién aprueba. Esto ES el
   «médico + piloto» de Vallaeys hecho producto.
2. **Diagnóstico de causa antes de reaccionar** (el fallo que señala Vallaeys): ante «2-3 días sin convertir», comprobar
   **primero lo técnico** (etiqueta disparando, formulario/landing caída — ya tenemos vigilancia de páginas caídas y
   PageSpeed —, GA4 vs Ads, CRM GoHighLevel recibiendo leads), **después** el mercado (cuota perdida por
   ranking/presupuesto, CPC, competencia en subastas) y **después** los cambios propios (historial de cambios, al estilo
   Ivitskiy). Ningún competidor cruza la web y el CRM con la cuenta; nosotros sí.
3. **Rutina diaria tipo Lolk automatizada**: ayer vs anteayer en clics/coste/CPC; alerta si una campaña **+140 %** o
   **deja de gastar**; rechazos; **no mirar conversiones de ayer** (retraso). Resumen semanal tipo Athena (lunes).
4. **Panel de umbrales calibrables** (regla del proyecto: ajustes editables), con valores por defecto sacados de los
   referentes: ratio Lin-Rodnitzky (1,5-2,0 sano), negativas 60 clics/5 €/<0,5 conv./90 días **escalado al CPA
   objetivo del cliente**, mínimo 50 conv./30 días para recomendar Smart Bidding, cambios >50 % día a día, alerta de
   CPC > X× histórico (caso 500 %), gasto > 2× presupuesto diario.
5. **Juez de términos de búsqueda con LLM + contexto del cliente** (la ficha de cliente: servicios, zona, lo que NO
   hace): el fallo del «coche barato» de Rooijmans se arregla con la ficha que ya tenemos. Confianza ≥85 % → propuesta
   prioritaria; resto → cola humana; las correcciones de Eury alimentan ejemplos. Haiku para clasificar en lote,
   determinista antes (directiva de optimización de IA del proyecto).
6. **Calidad del lead como verdad** (Ani, Vallaeys): con GoHighLevel, medir **coste por lead cualificado** y la tasa de
   cualificación por campaña/término; detectar «más formularios, peores leads»; preparar en el futuro la importación de
   conversiones offline diaria (con su vigilancia: «la subida lleva X días parada» = alerta, porque la puja deriva).
7. **Detector de canibalización**: PMax/AI Max sube lo que Search baja → «has movido leads, no los has añadido».
   Deduplicar términos de AI Max frente a exactas/frase (el trabajo de hoja de cálculo de Geddes, automatizado).
8. **Test de anuncios honesto**: CPI/CPA como filtro; mínimos por impresiones; **no declarar ganador por «95 %» mirado a
   diario** (Röttgerding): usar test con horizonte fijo o métodos secuenciales/bayesianos (lo ampliará el investigador
   08). Para pymes con poco volumen, test multi-grupo (Geddes).
9. **Auditoría con orden de Lolk** (propósito → fundamentos de medición → pujas/presupuesto → estructura → anuncios y
   landing → términos), **sin sugerencias sobre campañas de poco gasto** y diciendo también qué está bien.
10. **Vigilancia del historial de cambios**: ritmo de ediciones anormal, cambios el día de una caída, cambios de usuarios
    o herramientas desconocidos; sirve también para supervisar al propio equipo (Eury) y a la IA.
11. **Conocimiento vivo de cambios de Google**: el agente debe saber que el 17 ago 2026 cambió la puja tROAS limitada,
    que DSA migra a AI Max (2027, por verificar), que Ad Strength no correlaciona… Una tabla de «cambios de plataforma»
    con fecha que el diagnóstico consulte («¿coincide la caída con un cambio de Google?»).
12. **Flujo de aprobación con traza** (Optmyzr): cada propuesta guarda razonamiento, datos usados, quién aprobó; y
    comprobación de que **el cambio aplicado coincide con el razonamiento** (fallo visto por Wenner).
13. **Árbol de diagnóstico «no gasta / gasta de menos»** de Geddes (§2.2, método 4) como plantilla de diagnóstico
    automático: cada causa tiene una comprobación de datos concreta (cuota de impresiones, estimación vs real,
    audiencias, horario, ubicación, QS, topes de cartera, historial, canibalización PMax).
14. **Tests de anuncios segmentados por red y posición** (Röttgerding): excluir socios de búsqueda y comparar en
    «parte superior» y «resto» antes de declarar ganador.
15. **Guardarraíles para el LLM sobre datos** (Geddes 2026): calcular las métricas en código (nunca dejar que el modelo
    calcule CPA o presupuestos), fecha explícita en cada consulta, y validación de magnitud antes de proponer cambios
    de presupuesto o puja.
16. **Pocas funciones, bien hechas**: Wenner vio que más de 10-12 herramientas por agente lo vuelven inestable →
    agentes estrechos (términos, presupuesto/ritmo, anomalías, auditoría, anuncios) coordinados por el núcleo.

## Lo que nadie hace bien

- **Cruzar la cuenta con la web y el negocio**: las herramientas de los referentes (Optmyzr, Adalysis, 8020agent,
  Athena) ven solo la cuenta de Google (y a veces el feed). Nadie cruza de serie **landing caída/lenta, cambios en la web,
  Search Console (demanda orgánica de la marca), Google Business Profile (llamadas, reseñas) y CRM** para explicar el
  porqué de una caída.
- **Lead gen de pymes de servicios**: casi todo el contenido serio (smec, Lolk, Kirk Williams, Optmyzr) es e-commerce.
  La guía de Ani es de las pocas centradas en leads, y nadie lo convierte en vigilancia automática (calidad de lead,
  spam, llamadas cortas, ubicación por interés).
- **Incrementalidad**: todos lo piden (AI Max, PMax, marca) y nadie lo mide de forma sencilla para cuentas pequeñas.
- **Tests de anuncios estadísticamente correctos**: el problema de «mirar repetidamente» es conocido desde 2018 y las
  herramientas siguen mostrando «95 % de confianza».
- **Explicar el porqué en lenguaje de cliente y en español**: las alertas actuales dicen «el CPC subió 30 %», no
  «subió porque entró un competidor nuevo en la subasta y perdiste cuota por ranking en la parte superior».
- **Responsabilidad y traza de la IA**: solo Optmyzr empieza a resolverlo (revisor + justificación). Es un requisito
  para agencias (Kirk Williams).

## Lo no verificado

- Fórmula de QS de Geddes (pesos 3,5/1,75/2/1): vista en resúmenes de terceros; el artículo original (SEL) dio 403.
- Cuarto papel «restaurador» de Vallaeys (2025): solo visto en un resumen de búsqueda.
- Contenido de los libros de Jyll Saskin Gales, Kirk Williams y Perry Marshall (índices no accesibles); «peel & stick».
- Fechas de fin de DSA (enero 2027) y migración a AI Max (febrero 2027): las da JXT; verificar en la ayuda de Google.
- Cifras de alumnos/ventas de cursos (Rudansky, Leake: «4.500+ formados, 1.000 M$ gestionados» son autodeclaradas).
- Resultados de agencias autodeclarados (Rooijmans «3× beneficios»; caso de agencia que dobló gasto con Optmyzr).
- Referentes en español más allá de Lombana, Boluda y Kostic: no se pudo buscar (cupo de búsquedas agotado).
- Componentes del MAGIC Framework de Amy Hebdon.
- Los estudios de Optmyzr y smec son de proveedores con clientes propios (sesgo de muestra; correlación, no causalidad).

## Fuentes

- PPCsurvey: https://www.ppcsurvey.com/ · https://www.ppcsurvey.com/top-50-most-influential-ppc-experts-2026 ·
  https://www.ppcsurvey.com/top-50-most-influential-ppc-experts-2024 · https://www.ppcsurvey.com/top-100-most-influential-ppc-experts ·
  https://www.ppcsurvey.com/voices-of-ppc · https://ivitskiy.com/blog/en/ranked-6-most-influential-ppc-expert-2026/
- PPC Hero 2021: https://www.ppchero.com/?p=21482
- Vallaeys / Optmyzr: http://www.optmyzr.com/blog/automation-layering-ppc ·
  https://www.optmyzr.com/blog/beyond-automation-blackbox-human-machine-paid-media/ ·
  https://friendsofsearch.com/be/blog/interview/interview-frederick-vallaeys-search-professionals-need-to-understand-how-they-can-collaborate-with-automation-technology-rather-than-compete-against-it/ ·
  https://scribemedia.com/published-books/digital-marketing-in-an-ai-world ·
  https://www.goodreads.com/work/editions/94900799-unlevel-the-playing-field-the-biggest-mindshift-in-ppc-history ·
  https://www.optmyzr.com/ppctownhall/when-ai-changes-the-account-who-answers-for-it/ ·
  https://www.optmyzr.com/ppctownhall/what-agentic-ppc-actually-looks-like-in-practice/ ·
  https://www.optmyzr.com/ppctownhall/can-ai-agents-really-manage-google-ads-accounts/ ·
  https://www.optmyzr.com/ppc-town-hall/how-agencies-can-thrive-in-the-age-of-ai/
- Estudios Optmyzr: https://www.optmyzr.com/blog/impact-of-ppc-bidding-strategies/ ·
  https://www.optmyzr.com/blog/optmyzr-study-broad-match-bidding/ · https://www.optmyzr.com/blog/google-ad-strength-study/ ·
  https://www.optmyzr.com/blog/performance-max-study/ · https://www.optmyzr.com/blog/does-optimization-score-affect-google-ads-performance/ ·
  https://www.optmyzr.com/blog/google-ads-manual-work-study/
- Geddes / Adalysis: https://adalysis.com/blog/inside-ad-testing-metrics-conversion-per-impression-cpi/ ·
  https://adalysis.com/blog/ai-max-search-term-reporting/ · https://adalysis.com/?p=2756 ·
  https://adalysis.com/ppc-audits-rule-engine/ · https://docs.adalysis.com/tools/audit/audit-overview ·
  https://adalysis.com/blog/why-your-campaigns-are-underspending-and-how-to-fix-it/ ·
  https://adalysis.com/blog/data-study-5900-accounts-rsa-pinning/ ·
  https://adalysis.com/blog/chatgpt-or-claude-for-google-ads-analysis/ ·
  https://www.ppc-epiphany.com/2018/12/03/debunking-ad-testing-part-2-garbage-in-garbage-out/ ·
  https://www.oreilly.com/library/view/advanced-google-adwordstm/9780470640739/ · https://www.acquisio.com/blog/?p=6300
- Kirk Williams: https://blueberry-armadillo-nrag.squarespace.com/tools-and-resources/book-review-ponderings-of-a-ppc-professional-by-kirk-williams ·
  https://podcasts.apple.com/podcast/id1592733165
- smec / Mike Ryan: https://smarter-ecommerce.com/blog/en/google-ads/state-of-performance-max-campaigns-2025/ ·
  https://smarter-ecommerce.com/blog/en/google-ads/the-ultimate-guide-to-ai-max-for-google-search/ ·
  https://smarter-ecommerce.com/blog/en/google-ads/google-ends-its-bid-suppression-era-what-it-means-for-your-roas/ ·
  https://smarter-ecommerce.com/blog/en/google-ads/budget-limited-campaigns-after-august-17-the-roas-data/
- Rooijmans: https://www.nilsrooijmans.com/ · https://nilsrooijmans.com/google-ads-script-lin-rodnitzky-ratio/ ·
  https://nilsrooijmans.com/google-ads-script-negative-keyword-suggestions/
- Mike Rhodes: https://mikerhodes.com.au/ · https://mikerhodes.com.au/4cs · https://mikerhodes.com.au/agent
- Lolk: https://savvyrevenue.com/blog/google-ads-daily-check/ · https://savvyrevenue.com/blog/google-ads-audit/ ·
  https://savvyrevenue.com/blog/google-ads-mistakes/ · https://savvyrevenue.com/blog/search-campaign-structure/ ·
  https://savvyrevenue.com/blog/performance-max-audit/
- Gales: https://www.insidegoogleads.com/ · https://jyll.ca/book · https://jyll.ca/writer
- Marshall: https://www.perrymarshall.com/?p=39486 · https://everand.com/book/481608190/Ultimate-Guide-to-Google-Ads
- Gilbert: https://tertulia.com/book/join-or-die-digital-advertising-in-the-age-of-automation-patrick-gilbert/9781632217684
- Leake: https://godtierads.com/ · Hebdon: https://paidsearchmagic.podia.com/
- Röttgerding: https://www.ppc-epiphany.com/2018/10/23/debunking-ad-testing-part-1-statistical-significance/ ·
  https://www.ppc-epiphany.com/2019/03/06/debunking-ad-testing-part-3-the-small-picture/
- Menachem Ani / JXT: https://www.jxtgroup.com/performance-max-for-lead-generation/ ·
  https://www.jxtgroup.com/how-to-use-ai-max-for-search-campaigns/
- Ivitskiy: https://ivitskiy.com/blog/en/ · https://ivitskiy.com/blog/en/google-ads-change-history/
- AI Max (otros): https://ppc.land/googles-ai-max-for-search-campaigns-deliver-meh-results-industry-tests-reveal/ ·
  https://ppc.land/google-clarifies-ai-max-attribution-discrepancies-as-advertisers-discover-search-term-reporting-anomalies/
- Google: https://support.google.com/google-ads/answer/6167118
- Español: https://bigmomo.com/ · https://www.mercatitlan.com/juan-lombana · https://boluda.com/
