# R5 · Auditoría independiente del diseño técnico de Ads (pasos 1 y 2)

**Fecha:** 28 nov 2026 · **Auditor:** subagente independiente (Opus, esfuerzo alto) · **Objeto:** `docs/ads/DISENO-TECNICO-ADS.md`
(propuesta del 28 nov) · **Contrastado con:** `docs/ads/INVESTIGACION-GOOGLE-ADS.md` v3 (5.1, 7.1, 7.3, 8, 9 y 13.2) y el
código real (`lib/core/jobs.ts`, `capabilities.ts`, `findings.ts`, `findings-rules.ts`, `clients.ts`, `client-rules.ts`,
`net.ts`, `crawler.ts`, `lib/ai/encryption.ts`, `lib/agentes/integrations.ts`, `lib/rendimiento/`,
`lib/operaciones/agent-capabilities.ts`, `lib/operaciones/clickup.ts`, `lib/app-wiring.ts`, `lib/db/schema.ts`,
`tests/arquitectura-guardrails.test.ts`, `tests/auditoria.test.ts`, `scripts/check-architecture-map.js`).

**Encargo:** buscar fallos, no confirmar. Lo que digo de la API de Google Ads sale de la documentación pública que conozco
(hasta mediados de 2026) y queda marcado **[verificar en v26]** cuando no lo he podido comprobar contra la versión actual.

---

## Veredicto

**No está listo para programar tal cual, pero no hay que volver a empezar.** La estructura (módulo autocontenido, almacén
propio, MED-00 antes que las reglas, modo sombra, todo lectura) es correcta y cumple CLAUDE.md. Fallan tres cosas de
fondo: **(G1)** el modelo no distingue «sin filas» de «cero», y con eso las interrupciones 1 y 4 o no saltan nunca o
saltan en falso; **(G2)** la regla 12 contradice punto por punto el apartado 5.1 que dice aplicar; **(G3)** con descarga
cada 6 h y reglas sobre «ayer», las «interrupciones» llegan con hasta un día de retraso, y la investigación (PRO-01,
MED-12, MED-00) las diseña por horas. Hay además una docena de puntos importantes (destinatario de los avisos, procesos
que faltan, URL final que no existe a nivel de campaña, presupuestos compartidos, zona horaria del historial de
cambios…) que conviene cerrar en el documento antes del primer commit de `lib/ads`, porque casi todos cambian el esquema
de la migración 0084.

La decisión de autenticación (cuenta de servicio) es **técnicamente correcta** con dos matices serios (política de la
organización que bloquea claves; falta una alternativa real de reserva) que no obligan a cambiarla.

---

## GRAVE

### G1. «Dato ausente = NULL» choca con cómo devuelve filas la API: las reglas 1 y 4 no pueden distinguir «no hubo gasto» de «no tengo el dato»

**Evidencia.**
- Diseño §3, línea 86-88: «un dato ausente es `NULL` (no 0)»; `ads_daily_campaign` único `(campaign_id, day)` (línea 99).
- Las consultas de métricas segmentadas por fecha **no devuelven fila** para una campaña con cero impresiones ese día
  (guía «Zero metrics» de la API) [verificar en v26]. Es decir: una campaña parada no produce una fila con 0, produce
  **ninguna fila**.
- Regla 4 «gasto 0 ayer» y regla 1 «0 impresiones ayer y hoy» (líneas 143 y 146) dependen justo de ese cero.
- MED-00 (§5, línea 132) mide frescura por tiempo (`expected_every_minutes × 2`), no si el día que lee la regla está
  completo.

**Consecuencia.** Dos formas de romperse, según cómo lo programe quien venga después: (a) si la ausencia se lee como NULL
→ «no comprobado» → la campaña parada **nunca** salta; (b) si se lee como 0 → cualquier fallo de la descarga (consulta que
devuelve vacío por un campo renombrado, sincronización de las 19:00 que no cubre el final de «ayer») produce «campaña
parada» o «la cuenta no puede servir» **en falso**, por el canal de interrupción. Es exactamente el riesgo «el vigilante
está ciego y acusa al cliente» (investigación 12.1, línea 2127).

**Corrección redactada (para el §3 y el §5).**
> Añadir `ads_daily_coverage` (cuenta de Ads × día: `day`, `synced_at`, `complete` boolean, `control_cost`,
> `control_impressions`). Una sincronización de métricas marca `complete = true` para el día D solo si terminó después
> del cierre de D en la zona de la cuenta más el retraso de la fuente (≥ 3 h) **y** la consulta de control cuadra: el
> total de la cuenta pedido a `customer` (una consulta, sin segmentar por campaña) coincide con la suma de las filas de
> campaña (±1 %). Para un día cubierto, la ausencia de fila de una campaña que estaba `ENABLED` ese día (según
> `ads_config_versions`) **es 0**; para un día no cubierto es NULL y la regla devuelve «no comprobado». Las reglas
> declaran la **ventana de días** que necesitan, no solo la fuente, y `sourceHealth` comprueba la cobertura de esa ventana.

Esto es además la «consulta de control» que MED-00 exige («dato bueno no es "no dio error"», investigación línea 406) y
que el diseño no recoge.

### G2. La regla 12 (medición rota) contradice el apartado 5.1 que cita

**Evidencia.** Diseño línea 150: «acción primaria con ≥ 1 conversión/día de media en 28 días y 0 en los últimos N días,
N por Poisson para α = 1 % (apartado 5.1)». El apartado 5.1 (líneas 1057-1073) dice lo contrario en cuatro puntos:

| 5.1 manda | El diseño hace |
|---|---|
| 1. «**Sobre clics, no sobre días** (regla principal)»: μ = clics × CR; si el gasto cayó, manda a la rama de entrega | Sobre días, sin mirar los clics |
| 2. «**Binomial negativa por defecto, no Poisson**»; k = 2 de partida | Poisson |
| 3. λ y CR de la **media de 8 semanas** | 28 días |
| 5. «El umbral **no es un α fijo**»; corrección por pruebas múltiples también en el tiempo; calibrar con 90 días antes de enviar | α = 1 % fijo |

**Cuánto se equivoca, con números.** λ = 1 conversión/día, α = 1 %: Poisson da N = ⌈ln(100)/1⌉ = **5 días**. Con la
binomial negativa de partida (k = 2), la probabilidad real de 5 días a cero en una cuenta sana es (2/(2+5))² = **8,2 %**,
ocho veces el α declarado; para que sea 1 % hacen falta **19 días**. Con λ = 1,5: Poisson N = 4; probabilidad real
(2/8)² = 6,3 %. Evaluada cada día sobre todas las acciones primarias de 25 cuentas, la regla tal cual llenaría el parte
de «medición rota» falsas, que es el hallazgo que más quema la confianza (acusa a la web del cliente).

Dos problemas más que 5.1 no cubre y el diseño tampoco:
- **Retraso de las conversiones.** `metrics.conversions` va por **fecha del clic**: los últimos 1-3 días siempre están
  incompletos (atribución basada en datos ≈ 1 día, investigación 9.4). «0 en los últimos N días» incluye días inmaduros.
  Para detectar una etiqueta rota lo correcto es `metrics.all_conversions_by_conversion_date` (o
  `conversions_by_conversion_date`) segmentado por `segments.conversion_action`, que no tiene retraso de atribución
  [verificar nombres en v26].
- **Solapamiento con la regla 4.** Si la campaña está parada, la regla 12 también salta. El diseño deduplica «por causa»
  (línea 74) pero solo dentro de cada regla; no hay precedencia entre reglas.

**Corrección redactada (sustituye la fila 12).**
> 12 · Medición rota · A diario **solo a nivel de cuenta** (por campaña, semanal). Para cada acción primaria con ≥ 30
> conversiones en 8 semanas: μ = clics de la ventana × tasa de conversión de las 8 semanas previas (por fecha de
> conversión); P(0) = (k/(k+μ))^k con k estimado de la cuenta (k = 2 si no hay datos para estimarlo). Solo se evalúa si
> los clics de la ventana están dentro de su banda habitual (si no, la causa es de entrega: reglas 1/4). Umbral de
> partida α = 0,1 %, **calibrado en sombra** repitiendo 90 días de histórico hasta que las falsas alarmas quepan en el
> presupuesto de atención (5.1 punto 5). Por debajo de 30 conversiones en 8 semanas: «sin datos para afirmar», nunca
> «rota» (la protección en esas cuentas es MED-18/MED-17, paso 5).

Y añadir al §6 una **precedencia de causas**: 15 (nuestra fuente) > 1 (cuenta) > 4 (campaña parada) > 3 (landing) > 2
(rechazo) > 12 (medición) > 8/6/11. Una regla de rango inferior no se emite sobre la misma cuenta o campaña mientras haya
abierta una de rango superior; queda como evidencia dentro de esta.

### G3. Las «interrupciones» del paso 2 llegan con horas o un día de retraso: el diseño quitó lo horario sin decirlo

**Evidencia.**
- Diseño §4 (línea 121): `ads.sincronizar` cada 6 h; reglas 1 y 4 sobre «ayer» y «hoy» (líneas 143, 146); MED-00 sana si
  el último éxito tiene menos de 12 h (`expected_every_minutes × 2`, línea 132).
- Investigación: MED-12 (línea 418) «el corte se infiere con **impresiones por hora de toda la cuenta en horario de
  servicio** (3-4 horas a cero frente a su línea base), no esperando al "gasto a cero" del día»; PRO-01 (línea 470)
  fuente «`campaign` por día **y hora**», frecuencia H; MED-00 (línea 406) frescura de partida «Ads **2 h** en horario
  de anuncios»; 7.3 (línea 1586) la interrupción es «solo lo que **pierde dinero cada hora**».
- 9.1 (líneas 1897-1902): las comprobaciones horarias son las que hacen que Explorer no baste. El diseño (línea 126)
  concluye «cabe en Explorer» precisamente porque no hay nada horario.

**Consecuencia.** Una tarjeta rechazada a las 10:00 de un martes se detecta el miércoles a las 07:00 (regla 1 necesita
«ayer» a cero entero). Un gasto desbocado a las 08:00 se ve a las 13:00 como pronto. Eso es un parte, no una
interrupción, y es lo que el paso 2 promete («deja de entrar en las 25 cuentas a ver si pasa algo»).

Agravante, falso positivo seguro: la regla 1 exige «0 impresiones ayer **y hoy**». Evaluada a las 07:00 de un lunes en
una cuenta con programación de anuncios de lunes a viernes de 9 a 19, «ayer» (domingo) es 0 y «hoy» todavía es 0: salta
«la cuenta no puede servir» por el canal de interrupción.

**Corrección redactada (§4 y §6).**
> Añadir `ads.latido` (por cuenta de Ads, cada 60 min **solo dentro del horario de anuncios de la cuenta**): una consulta
> `SELECT segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date =
> TODAY` → `ads_hourly_campaign` (cuenta × campaña × fecha × hora; se guardan 60 días). Coste: 25 cuentas × ~12 horas =
> ~300 operaciones al día. Reglas 1 y 4 sobre horas: «0 impresiones en las últimas 3 horas de servicio en todas las
> campañas activas, cuando el mismo tramo de las 4 semanas anteriores (mismo día de la semana) tuvo ≥ X»; nunca fuera
> del horario programado de la campaña (ver I4). MED-00 de la fuente `latido`: 2 h en horario de anuncios.

Con eso el cupo sigue cabiendo en Explorer para los pasos 1-2 (ver I9), y la afirmación del §4 deja de ser engañosa.

---

## IMPORTANTE

### I1. Autenticación: la decisión A vale, pero le faltan dos riesgos y una alternativa de reserva de verdad

**Lo que está bien.** El flujo es el documentado para cuentas de servicio: JWT con cabecera `{"alg":"RS256","typ":"JWT",
"kid":<private_key_id>}`, reclamaciones `iss` = `client_email`, `scope` = `https://www.googleapis.com/auth/adwords`,
`aud` = `token_uri` del JSON (`https://oauth2.googleapis.com/token`), `iat` y `exp` ≤ `iat` + 3600; `POST` con
`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=…`; token de ~1 h, cacheado por proceso (web y
trabajador tienen procesos separados: cada uno lo pide). **Sin `sub`**: `sub` es para la delegación de dominio
(suplantar a un usuario de Workspace), que aquí no se usa. Cada petición: `Authorization: Bearer`, `login-customer-id`
= id de la MCC **sin guiones** (la MCC en la que se añadió la cuenta de servicio), y `developer-token` si siguiera
existiendo. Firmar con `node:crypto` (`createSign('RSA-SHA256')` y base64url) no añade dependencias. Correcto.

**Lo que falta.**
1. **Política de organización que impide crear claves.** Las organizaciones de Google Cloud creadas desde mayo de 2024
   aplican por defecto `iam.disableServiceAccountKeyCreation` («secure by default»). Si el proyecto de Cloud cuelga de la
   organización del Workspace de Kijutech, **no se podrá descargar la clave JSON** sin que un administrador de la
   organización haga una excepción para ese proyecto. No aparece en el diseño ni en el paquete A. Corrección: añadir a
   §1 «Lo no verificado» y al paquete A: «si la consola no deja crear la clave, Enric (administrador de la organización)
   crea una excepción de la política `iam.disableServiceAccountKeyCreation` **solo para el proyecto de Ads**».
2. **La clave no caduca y es un poder sobre las 25 cuentas.** Hoy es de lectura, pero cuando llegue el paquete C (escritura)
   la misma cuenta de servicio, con el rol subido en la MCC, podrá cambiar pujas en todas. Corrección: dejar escrito que
   **la escritura irá con otra cuenta de servicio** (o con el rol subido solo cuando se apruebe la decisión 9/10), y que
   la clave de lectura nunca se sube de rol.
3. **La alternativa B es un hombre de paja y falta la reserva real.** B (tocar Agentes y el núcleo) nadie la elegiría;
   C (no hacer nada) no es alternativa de autenticación. Falta **D: refresh token OAuth propio del módulo Ads** (cliente
   OAuth del mismo proyecto de Cloud, autorizado una vez por un **buzón de la agencia que no es de ningún empleado**, p.
   ej. `ads@…`, con acceso de lectura a la MCC). No toca Agentes ni el núcleo, es el flujo más usado con la API y no
   necesita clave privada. Riesgos: la pantalla de consentimiento en modo «Testing» hace caducar el refresh token a los
   **7 días** (hay que dejarla «Interna» o «En producción»); el inicio de sesión de ese buzón pide doble factor una vez.
   Corrección: sustituir la fila B por D como plan de reserva si la prueba de acceso con cuenta de servicio falla o la
   política del punto 1 no se puede excepcionar.
4. **Añadir la cuenta de servicio a la MCC es cambiar los accesos de la MCC**, el mismo tipo de cambio que la
   investigación trata como línea roja para el buzón de MED-14 (línea 420). Lo hace Enric en el paquete A; el diseño
   debería decirlo para que nadie lo intente desde la herramienta.
5. **El *developer token*.** Que esté «retirado el 9 sep 2026» es una afirmación de los informes 04 y 10 que no puedo
   confirmar (en la documentación que conozco es obligatorio en cada petición). El diseño ya lo deja opcional: bien. Pero
   `client.ts` debe enviarlo **siempre que esté guardado** y el botón «Probar conexión» debe mostrar el error literal de
   Google (sin secretos) para distinguir `DEVELOPER_TOKEN_*`, `USER_PERMISSION_DENIED` (falta `login-customer-id` o la
   cuenta de servicio no está en la MCC) y `AUTHORIZATION_ERROR` del proyecto (problema conocido citado en 9.1).

### I2. Los avisos solo pueden llegar a Enric: `notifyOwner` no sirve para Eury

**Evidencia.** `lib/operaciones/agent-capabilities.ts:809-819`: `notifyOwner` busca `getOwnerMember(tenantId)` y encola en
`ops_notifications` **para el dueño**. El núcleo no ofrece ninguna salida «a esta persona» por la cola de avisos
(`lib/core/capabilities.ts:90-96`: `sendText` va a un `chatId` directo, sin cola, sin clave única, sin reintentos).
Diseño línea 75: «interrupciones por `telegramOutbound().notifyOwner`»; §5 (línea 137): «#15 al responsable técnico
(Enric), nunca a Eury». La investigación (7.2, 7.3) diseña las interrupciones y el parte **para el gestor (Eury)**.

**Consecuencia.** Con el diseño tal cual, todo (también lo de Eury) le llega a Enric. En modo sombra no se nota; el día
que se enciendan los avisos, sí. Avisar a Eury por la cola exige una capacidad nueva del núcleo (p. ej.
`notifyMember(tenantId, userId, key, html, opts)` implementada por Operaciones sobre `enqueueNotification`): **eso es
tocar el núcleo** y, como la cola la usa también el SEO, pasa por el protocolo de decisión (lo mismo que ya dice 7.3 del
tope global). Usar `sendText` directo incumpliría CLAUDE.md («Todo aviso pasa por `ops_notifications`»).

**Corrección redactada (§2 `alerts.ts` y §11).**
> En los pasos 1-2 los avisos salen con `notifyOwner` (a Enric) y en modo sombra. Encender los avisos a Eury requiere
> una capacidad nueva del núcleo `notifyMember` (protocolo de decisión, «Afecta al SEO: no») antes de la semana de uso
> real. El hallazgo 15 sale con `{ bot: SYSTEM_BOT }` y **no** se duplica con `reportError` (que ya avisa por Telegram):
> se elige uno de los dos.

Detalles del mismo punto:
- `ops_notifications` tiene único `(tenant_id, dedupe_key)` (`lib/db/schema.ts:1597`): la clave del aviso debe llevar el
  **episodio** (`ads:<kind>:<cause_key>:<first_seen_at>`), no solo la causa, o un problema que vuelve semanas después
  no se avisará nunca.
- `notifyOwner` devuelve `void` y no hace nada si no hay dueño configurado (línea 811): `notified_at` no debe ponerse por
  haber llamado, sino leerse de la cola o aceptarse que es «encolado».
- «Horario laboral» en el diseño es `alert_hours = 09:00-19:00` (línea 92) sin días: un desbocado del sábado saldría el
  sábado, justo lo que 7.2 (línea 1536) quiere evitar. Añadir días laborables y festivos (calendario de la agencia) y
  decidir qué pasa con lo detectado fuera de horario (propuesta: se encola para las 09:00 del siguiente día laborable si
  sigue abierto; si ya se resolvió, no sale).
- El tope es «por cuenta de la agencia» (línea 155); 7.3 lo define **por persona**. Mientras todo vaya a Enric da igual;
  dejarlo escrito por persona para no rehacerlo.

### I3. Faltan procesos: nadie evalúa las reglas, nadie rastrea las landings y nadie despacha los avisos

**Evidencia.** §4 (líneas 118-123) solo tiene descarga (`ads.descubrir`, `ads.sincronizar`, `ads.cambios`,
`ads.historico`). La fuente `rastreo_landing` aparece en `ads_sync_state` (línea 94) y en la regla 3, pero ningún proceso
la alimenta. La evaluación de reglas (`findings.ts`) y el envío con tope y horario (`alerts.ts`) no tienen tipo de trabajo
ni tarea del planificador. El Mapa Visual y `check-architecture-map.js` (§10) exigen precisamente que tipos de trabajo y
tareas estén en el mapa: si no están en el diseño, no estarán en el mapa.

**Corrección redactada (añadir al §4).**
> | `ads.evaluar` (por cuenta de Ads) | Al terminar `ads.sincronizar` o `ads.latido` (encolado por ellos, con `dedupeKey`) |
> Evalúa las reglas con su ventana y su cobertura, guarda `ads_rule_runs` y `ads_findings` | 0 |
> | `ads.landing` (por cuenta de Ads) | 60 min en horario de anuncios | Pide cada URL final con gasto en 7 días con
> `safeFetcher` del núcleo (`lib/core/crawler.ts:27`); dos fallos seguidos con al menos 10 min entre ellos → hallazgo 3 |
> 0 operaciones; ~N peticiones HTTP |
> | Tarea del planificador `ads avisos` (`registerScheduled`) | Cada 30 s (líder) | Envía las interrupciones abiertas no
> avisadas, con tope por persona, horario y días laborables; agrupa la tercera y siguientes | 0 |

### I4. Falsos positivos evidentes en las reglas 1, 4, 6 y 8 (y no coinciden con la investigación)

**Regla 4, «parada»** (línea 146: «gasto medio ≥ 5 €/día en 14 días y gasto 0 ayer»):
- **Programación de anuncios:** una campaña que no sirve en fin de semana tiene media de 14 días > 5 € y gasto 0 cada
  sábado y domingo → salta dos veces por semana. PRO-01 (línea 470) pide comparar con el **mismo día de la semana**.
- **Fecha de fin**, presupuesto agotado temprano, campaña de temporada: no son «parada».
- Falta consultar `campaign_criterion` de tipo `AD_SCHEDULE` (no está en las consultas del §4) para saber si «hoy» o
  «esta hora» le toca servir.

**Regla 4, «desbocada»** (línea 146: «gasto de hoy proyectado > 2 × media de 14 días y > 1,5 × presupuesto»):
- Google permite gastar **hasta 2 × el presupuesto diario** un día concreto (límite mensual 30,4 ×) y, desde el 1 jun 2026,
  las campañas con días apagados gastan más los días activos (investigación 9.5, línea 1972). «> 1,5 × presupuesto»
  salta en días normales de entrega extra. PRO-01 dice: «≥ 1,5 × presupuesto **sin conversiones cuando se esperaba
  alguna**, o acumulado de 3 días > 1,3 ×».
- «Proyectado» a partir de pocas horas (descarga a las 07:00 o 13:00) extrapola de forma lineal un gasto que no es
  uniforme. Proyectar con el **perfil horario** del mismo día de la semana (de `ads_hourly_campaign`, G3) o comparar
  el acumulado hasta esta hora con el acumulado típico hasta esta hora.

**Regla 1, segunda rama** («`primary_status` con motivo de facturación/suspensión», línea 143): no conozco ningún valor
de `campaign.primary_status_reasons` que sea de facturación; la propia investigación dice que la API **no tiene** alertas
de pago (9.2, línea 1920). Lo verificable es `customer.status` (`SUSPENDED`, `CANCELED`, `CLOSED`),
`campaign.serving_status` y, solo en cuentas con factura mensual, `account_budget` [verificar en v26]. Corregir la regla a
esas señales más la inferencia horaria de G3.

**Regla 6** (línea 147: «pausada en 7 días con ≥ 2 conversiones en 30 días»): PRO-13 (línea 482) dice «aportaba **más del
10 % de los leads de la cuenta** en los 60 días previos; aviso a los 3 días; con quién la pausó». Con «≥ 2 conversiones»
salta en casi cualquier pausa deliberada del gestor. Además choca con el silencio de 7.3 «tras un cambio propio en esa
campaña: 14 días»: hay que decidir si una pausa nuestra cuenta (propuesta: sí, pero solo si supera el 10 % y como «para
que lo sepas», nunca como decisión).

**Regla 8** (línea 148): ±15 % frente a ±10 % de PRO-07 (línea 476); sin suelo de días (el día 2 del mes la proyección es
ruido; empezar el día 5 o usar el presupuesto esperado al día); el respaldo «suma de presupuestos diarios × días» cuenta
dos veces los **presupuestos compartidos** (I5) e ignora las campañas que empiezan o terminan a mitad de mes. Falta
«presupuesto agotado antes de las 14:00» de PRO-07, que necesita el dato horario de G3.

**Regla 2** (línea 144): «`disapproved_ads > 0` y es la de más gasto» salta aunque solo esté rechazado 1 anuncio de 10 y la
campaña sirva igual. Lo que pierde dinero es un **grupo de anuncios sin ningún anuncio aprobado que pueda servir**, o un
grupo de recursos de PMax rechazado. Corregir a: «grupos de anuncios activos con gasto en 14 días que hoy no tienen
ningún anuncio `APPROVED`/`APPROVED_LIMITED`, o recursos rechazados (enlaces de sitio, llamada) en la campaña que más gasta;
canal según el gasto expuesto». PRO-05 (línea 474) también pide palabras clave rechazadas
(`ad_group_criterion.approval_status`).

**Corrección general.** Reescribir la tabla del §6 tomando **literalmente** las reglas de PRO-01, PRO-05, PRO-07 y PRO-13
de la investigación (o justificando por escrito cada desviación), y añadir una columna «ventana y cobertura que necesita».

### I5. Columnas que la API no rellena como dice el modelo

| Columna (diseño) | Problema | Corrección |
|---|---|---|
| `ads_campaigns.final_urls` (línea 96) | **La campaña no tiene URL final.** Las URL finales viven en el anuncio (`ad_group_ad.ad.final_urls`), en los recursos (enlaces de sitio), en los grupos de recursos de PMax (`asset_group.final_urls`) y, con expansión de URL, en las que elige Google (`expanded_landing_page_view`). La regla 3 no se puede programar sobre esta columna | Tabla `ads_landing_urls` (cuenta × URL normalizada: origen `anuncio`/`enlace_sitio`/`grupo_recursos`/`expandida`, campañas que la usan, gasto 7 días, `first_seen_at`, `last_seen_at`) alimentada por una consulta a `landing_page_view` + `expanded_landing_page_view` (que ya traen el gasto por URL) y otra a `ad_group_ad` |
| `ads_campaign_status_daily.disapproved_ads`, `limited_ads` (línea 101) | No hay contador por campaña. Sale de una consulta aparte a `ad_group_ad` con `policy_summary.approval_status` (y a recursos y grupos de recursos para PMax). No está contada en las 5-6 operaciones del §4 | Contarla en el cupo (I9) y guardar por **grupo de anuncios** lo que necesita la regla 2 corregida (I4) |
| `ads_campaign_status_daily.recommended_budget` (línea 101) | `campaign_budget.recommended_budget_amount_micros` y los campos de estimación asociados fueron declarados obsoletos/sin rellenar hace varias versiones [verificar en v26]. La vía es el recurso `recommendation` de tipo `CAMPAIGN_BUDGET` | Quitar la columna; si se quiere, foto diaria de `recommendation` (8.3 ya lo pide) en el paso 3 |
| `ads_campaigns.budget_amount` (línea 96) | Un presupuesto **compartido** (`campaign_budget.explicitly_shared`) aparece entero en cada campaña que lo usa; sumarlos cuenta dos veces. Además existen presupuestos de periodo total (no diario) | Tabla `ads_budgets` (cuenta × `native_id`: importe, periodo, compartido, entrega) y `ads_campaigns.budget_native_id`; las sumas por cuenta se hacen sobre presupuestos, no sobre campañas |
| `ads_campaigns.target_cpa` / `target_roas` | Según la estrategia el objetivo vive en `campaign.maximize_conversions.target_cpa_micros`, en `campaign.target_cpa`, o en la **estrategia de cartera** (`bidding_strategy`), que no está en el modelo | Leer las tres fuentes y guardar `bidding_strategy_native_id`; versión en `ads_config_versions` |
| `ads_conversion_actions` y `ads_daily_conversion.conversion_action_id` | Con seguimiento de conversiones **entre cuentas** (acciones propiedad de la MCC), las filas de métricas traen `customers/<MCC>/conversionActions/…`, que no aparecen al listar las acciones de la cuenta hija: una clave foránea a `ads_conversion_actions` falla | Guardar el `resource_name` de la acción como texto (sin clave foránea obligatoria) y dar de alta la acción al verla por primera vez |
| `ads_daily_conversion` solo `conversions` | `metrics.conversions` segmentado por acción solo cuenta las acciones incluidas en «Conversiones»; las secundarias salen a 0. Para MED-01/MED-02 y la regla 12 hace falta `all_conversions` y la versión **por fecha de conversión** | Columnas `conversions`, `all_conversions`, `conversions_by_conv_date`, `all_conversions_by_conv_date`, valores |

### I6. Historial de cambios: clave única frágil, zona horaria y límites de la consulta

**Evidencia.** Diseño línea 102: único `(account_id, resource_name, change_at)`; línea 122: «últimos 14 días… 1
operación».

- **Clave.** Cada fila de `change_event` tiene su propio `change_event.resource_name`
  (`customers/{id}/changeEvents/{marca}~{orden}~{mutación}`), único. Usar el recurso **cambiado** más la hora puede
  chocar (dos mutaciones del mismo recurso en el mismo instante desde Editor o una carga masiva) y perder cambios.
  Corrección: único `(account_id, event_resource_name)`; `resource_name` del objeto cambiado como columna aparte.
- **Zona horaria.** `change_event.change_date_time` llega como texto **en la zona de la cuenta y sin desfase**. Guardarlo
  en un `timestamp` sin convertir lo descoloca 1-2 h, y en la hora repetida del cambio de horario de octubre hay
  ambigüedad real. Corrección: convertir con `ads_accounts.time_zone` a `timestamptz` y guardar también el texto original.
- **Límites de la consulta.** La guía de `change_event` exige filtro por `change_date_time` dentro de los últimos 30 días
  y una cláusula `LIMIT` de como mucho **10.000** filas [verificar en v26]. Una carga masiva de Editor pasa de 10.000 en
  un día. Corrección: ventana desde el cursor menos 1 día de solape (no «14 días» cada 6 h, que relee lo mismo 56 veces),
  `ORDER BY change_event.change_date_time`, `LIMIT 10000`, y si vuelven 10.000 filas, seguir desde la última hora vista;
  la deduplicación la hace la clave única.
- **Hueco irrecuperable.** Si la fuente `cambios` está caída más de 30 días, lo perdido no vuelve. MED-00 debe tratar
  `cambios` atrasada más de **7 días** como crítica (aviso técnico), no solo como «atrasada».
- **Editor.** El enumerado `ChangeClientType` tiene, en la documentación que conozco, un valor `GOOGLE_ADS_EDITOR`
  [verificar en v26], lo que contradiría el informe 04 citado en 9.2. Grabar `client_type` tal cual y comprobarlo en la
  prueba de acceso: de ello depende el cierre automático de 7.2.
- **Regla 11** necesita saber qué es «de la agencia»: `ads_settings` no tiene la lista. Añadir `agency_email_domains` y
  `agency_user_emails` (hay personas que usan su gmail), y clasificar en `agencia` / `cliente` / `google` / `herramienta`
  como dice PRO-08.

### I7. Hallazgos: «no comprobado» no puede resolver un hallazgo, y la cabecera de Hoy no tiene de dónde leer

**Evidencia.** §5 (línea 134): si la fuente no está sana la regla devuelve «no comprobado» y la cabecera lo cuenta. Pero
no hay tabla donde quede ese resultado: `ads_findings` (línea 104) solo guarda positivos. Si `findings.ts` reutiliza el
ciclo de vida del núcleo (`lib/core/findings-rules.ts:41`: «lo abierto que ya no aparece» se resuelve), un hallazgo
abierto se **resolvería solo** el día que la fuente cae, que es lo contrario de lo que pide MED-00.

**Corrección redactada.**
> Tabla `ads_rule_runs` (cuenta de Ads × regla: `evaluated_at`, `outcome` `ok`/`hallazgo`/`no_comprobado`, `reason`,
> `data_through`). La cabecera de Hoy lee de aquí. En `findings.ts`, un hallazgo abierto solo se resuelve si la regla se
> evaluó con fuentes sanas y no lo encontró; con `no_comprobado` se deja como estaba y se marca «sin comprobar desde…».

Y en `ads_findings`: `account_id` **anulable** (o columna `scope`), porque el hallazgo 15 cuando cae la credencial es una
sola causa para las 25 cuentas (7.3: «una sola por causa común»); índice único parcial `(tenant_id, cause_key) WHERE
status IN ('abierto','silenciado')`; `CHECK` de `kind` con la lista cerrada.

### I8. El objetivo provisional del diseño está sesgado a la baja

**Evidencia.** Diseño línea 170: «mediana del CPL diario de los 90 días previos (días con conversiones)». Al quitar los
días sin conversiones se quita su gasto: el CPL resultante es sistemáticamente **menor** que el real, más cuanto menos
volumen tiene la cuenta (justo las que más abundan). Con conversiones fraccionarias (0,37) el CPL de un día suelto se
dispara y la mediana es inestable. La investigación 8.1 punto 3 (línea 1748): «los CPA se recalculan desde las sumas».

**Corrección.** «Coste total de los 90 días previos a la fecha del acuerdo / conversiones primarias totales de esos 90
días (por fecha de clic, excluyendo los últimos 7 días si la acción madura despacio); si hay menos de 15 conversiones en
90 días, no se fija objetivo provisional: "sin datos suficientes"». Congelado como dice 2.2. Y añadir el pendiente «a los
90 días sin acuerdo real» de 2.2 (línea 265), o apuntarlo como paso 7.

### I9. El cupo está mal contado (cabe, pero por menos margen del que dice)

**Evidencia.** Diseño línea 121: 5-6 operaciones por sincronización; línea 125: 700 al día. Las consultas que el propio
diseño necesita y no cuenta: `campaign_budget` (I5), estrategias de cartera, `campaign_criterion` de programación (I4),
`ad_group_ad` con políticas (I5), recursos y grupos de recursos de PMax, `landing_page_view`/`expanded_landing_page_view`
(I5), `customer` (estado, seguimiento automático, consulta de control de G1), metas de conversión
(`customer_conversion_goal`/`campaign_conversion_goal`, para saber qué es primaria) y conversiones por fecha de
conversión. Son **~12 por sincronización**: 25 × 12 × 4 = 1.200, más `ads.cambios` (100), más `ads.latido` (~300),
más el histórico (~650 una vez) ≈ 2.250 el primer día frente a 2.880 de Explorer y un `daily_ops_budget` de 2.500.

**Corrección.** Separar frecuencias: estructura, configuración, políticas y URL **una vez al día** (los cambios del día ya
los ve `change_event`, que puede disparar una resincronización de estructura de esa cuenta); métricas de 10 días 4 veces
al día (2 consultas); latido horario (1). Queda en ~800-900 al día, con sitio para el histórico y para los pasos 3-4.
Dejar escrito que **los pasos 3-4 (términos, palabras, nivel de calidad) sí necesitan Basic** (9.1), para que nadie lea
«cabe en Explorer» como algo permanente.

Detalles: el cupo diario se reinicia a medianoche **hora del Pacífico** [verificar], no de Madrid: `ads_api_usage.day`
debe ir en esa zona. Distinguir `RESOURCE_EXHAUSTED` (cupo del día: no reintentar, parar hasta el reinicio y que MED-00
lo diga) de `RESOURCE_TEMPORARILY_EXHAUSTED` (ritmo: reintentar con la espera que trae el error); el diseño (línea 66)
los trata igual. El histórico: una consulta `searchStream` puede traer 37 meses de campaña × día de una vez sin coste
extra (paginar no gasta); los tramos de 90 días tienen sentido por memoria y tiempo máximo, no por cupo. «Hasta un tramo
vacío» (línea 123) corta antes de tiempo en clientes de temporada con 3+ meses parados: usar solo `history_months`.

### I10. El histórico pierde las campañas eliminadas si la estructura las filtra

`ads_daily_campaign.campaign_id` apunta a `ads_campaigns`. Si la sincronización de estructura excluye
`campaign.status = 'REMOVED'` (lo habitual), las filas de métricas de 37 meses de campañas ya borradas no tienen a qué
colgarse: o fallan o se descartan, y el histórico sale con huecos. Corrección: la consulta de métricas trae también
`campaign.id`, `campaign.name`, `campaign.status`, `campaign.advertising_channel_type`, y el guardado da de alta la
campaña si no existe (con `status = 'REMOVED'`).

### I11. Modo simulado en producción: datos falsos mezclados con los reales

**Evidencia.** Diseño línea 46-48: credencial `SIM` que «genera cuentas y datos deterministas»; mismo esquema y mismas
tablas. El `SIM:` de ClickUp (`lib/operaciones/clickup.ts:126-127`) **no genera datos**: solo impide llamar a internet;
no es el mismo patrón.

**Consecuencia.** Si alguien activa `SIM` en el tenant de producción (por ejemplo, para enseñar las pantallas antes del
acceso), Cartera mezcla 6 cuentas inventadas vinculadas o vinculables a clientes reales, y quitarlas después es un
`DELETE` de filas en producción (zona de línea roja 4, aunque sean simuladas).

**Corrección.** Columna `simulated boolean` en `ads_accounts` (y heredada por clave en el resto); las cuentas simuladas
nunca se vinculan a un cliente real, nunca generan avisos y la pantalla las pinta con banda «SIMULADO»; al pasar a
`service_account` se **ocultan**, no se borran. Mejor aún: permitir `SIM` solo en el tenant de pruebas (el que usan las
pruebas `pantallas-*`) o fuera de producción.

### I12. Granularidad que obligará a rehacer en los pasos 3-6

- **Red y dispositivo.** 8.2 (línea 1771) define el diario por campaña como «campaña × día × **red × dispositivo**», y el
  diagnóstico del paso 6 necesita socios de búsqueda frente a Google. El diseño guarda campaña × día sin segmentos y con
  único `(campaign_id, day)`. Añadirlos después cambia la clave y obliga a migrar o a convivir con dos tablas que, si se
  suman, **cuentan dos veces**. Corrección: decidir ahora: o `ads_daily_campaign` con `network` y `device` en la clave (y
  las vistas suman), o dejar escrito que el detalle por red/dispositivo irá en otra tabla de extensión y que **nunca** se
  suma con la principal.
- **Nivel de cliente en la cuenta.** `client_level` está en `ads_accounts` (línea 93), pero el nivel A/B/C es **del
  cliente** (un cliente con dos cuentas tendría dos niveles) y la investigación lo considera de toda la agencia (8.4,
  línea 1846). Ya existe `ops_clients.level` (`lib/db/schema.ts:1875`) en Operaciones, que Ads no puede leer. Corrección:
  ponerlo en `ads_goals` (ya es por cliente) junto al objetivo, y apuntarlo como candidato al núcleo con el propio
  `ads_goals`.
- **MED-06 no está.** El paso 1 de 13.2 (línea 2368) incluye «← MED-06 (solo recogida)»: la curva de madurez. El diseño
  no la menciona. Es recuperable después con `segments.conversion_lag_bucket` [verificar], así que basta con decirlo:
  «MED-06 se calcula en el paso 5 con `conversion_lag_bucket` sobre el histórico; no requiere recogida diaria». Si no se
  dice, parece olvidada.
- **GOO-07** pide además aviso 60 días antes de la retirada de la versión y uso diario para no llegar a 90 días sin uso;
  el diseño solo tiene versión configurable y pruebas de contrato. Añadir una comprobación de salud con la fecha de
  retirada de la versión en uso.

---

## MENOR

1. **`tenant_id` en todas las tablas.** Ninguna tabla del §3 lo lista (salvo lo implícito en `ads_settings`). CLAUDE.md
   pide multi-tenant desde el esquema y todas las tablas del núcleo lo llevan. Añadirlo a todas, con índices que empiecen
   por él donde se filtre.
2. **Únicos e índices que faltan.** `ads_accounts` único `(tenant_id, platform, customer_id)`; `ads_campaigns` único
   `(account_id, native_id)`; `ads_conversion_actions` único `(account_id, resource_name)`; `ads_daily_conversion` único
   `(campaign_id, conversion_action_resource, day)` (el diseño dice «único» sin columnas); `ads_config_versions` único
   parcial `(account_id, entity_type, entity_native_id) WHERE valid_to IS NULL`; `ads_sync_state` clave
   `(account_id, source)` y fila de tenant para `descubrir` (que no es de una cuenta de Ads); `ads_api_usage` clave
   `(tenant_id, day)`; `ads_goals` único `(client_id, version)`; índices `(account_id, day)` en las diarias y
   `(account_id, change_at DESC)` en cambios. Tipos: conversiones `numeric(14,4)` (no `numeric` sin precisión).
3. **Ámbito de los procesos.** `jobs.scope_type` solo admite `proyecto`/`cliente`/`cuenta` (`lib/db/schema.ts:3603`) y
   «cuenta» significa el tenant. Para «por cuenta de Ads» hay que usar `scopeType: 'cuenta'` con `scopeId` = id de
   `ads_accounts` (cabe: `varchar(64)`). Dejarlo escrito para no intentar un tipo nuevo, que sería tocar el núcleo.
4. **«07:00 la principal»** (línea 121) no se puede expresar con `job_schedules`: solo hay `every_minutes`, la siguiente
   ejecución se calcula desde la hora del tic (`lib/core/jobs.ts:300`) y tras fallos se espacia (`:74-77`), así que la
   hora deriva. Si el parte de la mañana depende de una descarga a hora fija, usar `registerScheduled` con comprobación de
   reloj, o encolar con `runAt` calculado.
5. **Registro en la aplicación.** `lib/ads/register.ts` tiene que añadirse a `wireApp()` (`lib/app-wiring.ts:20-33`); el
   diseño no lo dice.
6. **El nodo del Mapa Visual no existe todavía.** §10 dice «nodo `ads` en `registry.ts` (deja de ser futuro)», pero en
   `FUTURE_NODES` (`lib/architecture-map/registry.ts:303-320`) no hay ningún nodo de Ads: hay que crearlo.
7. **Auditoría de secretos.** La prueba «los tokens cifrados no viajan a los componentes» (`tests/auditoria.test.ts:162-176`)
   busca nombres concretos de columna (`apiKeyEncrypted`, `botTokenEncrypted`…). Las de Ads (`credentials`,
   `developerToken`) no quedarían cubiertas: añadirlas a la expresión. Y `client.ts` no debe incluir nunca el JWT, el
   token ni el cuerpo de la petición de token en los mensajes que van a `reportError`.
8. **Validación de la clave subida.** Comprobar `type === 'service_account'`, `client_email`, `private_key`,
   `private_key_id`, `token_uri`; límite de tamaño; mostrar solo el correo enmascarado y el `private_key_id` corto.
9. **Vinculación con la ficha.** `client_assets.value` es texto libre (`lib/db/schema.ts:220`) y no hay normalización para
   `google_ads` (`lib/core/client-rules.ts:139`): «123-456-7890», «1234567890» o una URL. Normalizar a 10 dígitos al
   comparar; si dos clientes reclaman el mismo id, no vincular y avisar. `ads_accounts.client_id` es una copia que se
   queda vieja si alguien cambia la ficha: recalcular en cada `ads.descubrir` salvo vínculo manual (`linked_by`). Usar
   `listPrimaryAssets(tenantId, ['google_ads'])` del núcleo. Clave foránea a `clients` con `ON DELETE SET NULL` (o guarda
   de borrado con `registerClientDeleteGuard` si se quiere impedir borrar un cliente con objetivos).
10. **`customer_client`** devuelve también la propia MCC, sub-MCC, cuentas ocultas, canceladas y de prueba: filtrar
    `manager = false`, `test_account = false` y estado; pedir métricas a una MCC da error.
11. **Moneda.** Si alguna cuenta no está en euros, Cartera no puede sumar gastos entre cuentas; las reglas con «5 €/día»
    deben ir en la moneda de la cuenta.
12. **Landing: qué es «caída».** `safeFetcher`/`fetchPublic` se identifican como `KijutechBot` (`lib/core/crawler.ts:18`);
    muchas webs detrás de un cortafuegos responden 403 o 429 a un bot. Contar como caída solo DNS, TLS, conexión
    rechazada o agotada, 5xx y 404/410; 403/429 → «no comprobable». `fetchPublic` lanza en errores de red
    (`lib/core/net.ts:157`): capturarlo como caída, no como fallo del proceso. La caducidad de certificado y dominio a
    14 días (PRO-06) no está en el diseño: apuntarla como pendiente.
13. **«Encargar» puede ir ya en el paso 2.** El núcleo ya ofrece `workSource().createTask` y `clientOpen`
    (`lib/core/capabilities.ts:421-431`); 13.2 (línea 2369) pide «las ocho respuestas, activas» en el paso 2, y el
    silencio «mientras hay un encargo abierto» de 7.3 usa justo eso.
14. **Copia antes de migrar.** El diseño no recuerda la regla «Backup obligatorio antes de migrar un módulo nuevo» de
    CLAUDE.md (`pg_dump` a `backups/backup_pre_ads_<fecha>.sql` y rama propia) antes de aplicar 0084 en local.
15. **Foto de estado** (`ads_campaign_status_daily`, 4 descargas al día con único por día): decir cuál gana (la última) o
    guardar la peor del día; un rechazo que dura de 10:00 a 15:00 se pierde con «la última».
16. **Pruebas de contrato «escritas desde la documentación»** (§9): no protegen de lo que GOO-07 quiere proteger (campos que
    cambian de nombre). Correcto marcarlas; añadir que la primera respuesta real de la prueba de acceso **sustituye** a
    esas grabaciones y que hasta entonces no cuentan como GOO-07 hecho.

---

## Lo que está bien (para no tocarlo)

- Módulo autocontenido en `lib/ads`, sin importar Agentes ni SEO, con la URL de la API en un solo archivo y su barrera en
  `tests/arquitectura-guardrails.test.ts` (que ya clasifica `ads` como módulo y `ads_` como prefijo).
- Hallazgos en `ads_findings` y no en `findings` del núcleo: el motivo es cierto (`findings.project_id` es obligatorio y
  `syncFindings` trabaja por proyecto, `lib/core/findings.ts:45-60`).
- Todo lectura en los pasos 1-2, modo sombra hasta que Enric lo encienda, credenciales cifradas con
  `lib/ai/encryption.ts` (AES-256-GCM, el mismo patrón que `agt_integrations`) y nunca en el navegador.
- Avisos por la cola (`notifyOwner` → `ops_notifications`), no por Telegram directo; `telegramOutbound` está disponible
  también en el contenedor trabajador porque `wireApp()` se llama con los dos papeles (`instrumentation.ts`).
- Migración aditiva, sin dependencias nuevas.

## Lo que esta auditoría no ha podido verificar

Todo lo marcado [verificar en v26]: filas omitidas con métricas a cero, límites de `change_event` (30 días, `LIMIT`
10.000), valor `GOOGLE_ADS_EDITOR` de `ChangeClientType`, obsolescencia de `recommended_budget_amount_micros`, nombres de
las métricas por fecha de conversión, `conversion_lag_bucket`, reinicio del cupo en hora del Pacífico, retirada del
*developer token* y acceso directo de cuentas de servicio a la MCC. La política `iam.disableServiceAccountKeyCreation`
depende de cuándo se creó la organización de Cloud de Kijutech y de si el proyecto cuelga de ella.
