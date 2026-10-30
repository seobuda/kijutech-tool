# Mapa Visual: módulo Operaciones completo, mapa vivo y regla permanente
**Fecha:** 2026-10-30  
**Rama:** operaciones  
**Commit:** COMMIT_CODE

## Qué se construyó
- `lib/operaciones/process-map.ts` — reescrito: `OPS_MAPS` con el nivel 2 (13 procesos y piezas de Operaciones) y 9 mapas de nivel 3 (Entrada de trabajo, Ejecución, Vigilancia de ClickUp, Planificador, Resúmenes, Pasada diaria, La memoria, Fiabilidad y seguridad, Integraciones con el prompt de cada función de IA) más `tech_debt`. Cada paso declara cuándo se ejecuta, qué decide la IA, qué decide el código, tablas, ajustes del panel (`settings`), prompts, tareas del planificador (`runs`) y proveedor de última ejecución (`live`).
- `lib/architecture-map/registry.ts` — «Operaciones» pasa a `built` y abre su mapa; nodo «Integraciones»; fila de pendientes en gris (`FUTURE_NODES`: Servidor, Jornada y rendimiento, Niveles y recompensas, Subagentes por área, Diccionario, Audios al bot, Entrada por email, Reglas que aprenden, SEO automatizado, Deuda técnica); conexión discontinua Operaciones → Subagentes («revisor intercambiable»); `PROCESS_MAP_IDS`.
- `lib/operaciones/map-live.ts` — datos en vivo: valores actuales del panel de Automatizaciones y última ejecución/error de vigilancia, pasada de actividad, resúmenes, recordatorios, cola de avisos, bandeja de salida, Telegram, planificador y caché de ClickUp (con peticiones de la última hora). Sin tablas nuevas.
- `app/(dashboard)/dashboard/architecture/{page,architecture-map-client}.tsx` — navegación por niveles con migas de pan, insignias de última ejecución/error, línea de ajustes con valores reales, ventana de detalle con las secciones nuevas, enlace «Abrir este ajuste» al panel y botón «Sigue en…» para recorrer una nota hasta completada.
- `lib/ai/clustering/pipeline.ts` — `ProcessStep` ampliado con campos opcionales (los mapas de SEO no cambian).
- `scripts/check-architecture-map.js` (+ `pnpm check:map` en `package.json`) — comprobación automática.
- `CLAUDE.md` — la regla del Mapa Visual pasa a permanente: ningún paso está terminado hasta que el mapa lo refleje, y la comprobación se ejecuta antes de cada commit de cierre de paso.
- `automatizaciones-view.tsx` — ancla `#auto-<clave>` en cada tarjeta para enlazar desde el mapa.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- El mapa de Operaciones sigue en `process-map.ts` (patrón ya existente) y no junto a las funciones, porque los archivos `'use server'` solo pueden exportar funciones async.
- La comprobación es JavaScript plano que lee texto (no necesita instalar nada ni compilar) y valida: automatizaciones del panel, tareas del planificador, prompts de IA, tablas `ops_*`, archivos citados, enlaces entre mapas, proveedores `live` e ids únicos. Probé que falla al quitar una entrada.
- Los valores del panel no se escriben en el mapa: se leen en cada carga (caché de 10 s del panel).
- Los antiguos pasos sueltos (crear tarea, confirmar o reintentar, guardar como pendiente) se fundieron en «Envío fiable a ClickUp»; los del Equipo y Clientes pasaron a «La memoria».
- Descripciones de los pendientes en gris: las de Subagentes, Diccionario, Jornada y rendimiento y Niveles y recompensas son las del usuario; el resto, propuestas a confirmar.

## Qué verificar manualmente
- Mapa → Operaciones → Entrada de trabajo → «Aviso por Telegram» → «Sigue en: Ejecución»: recorrido de una nota hasta «Completado y cierre en ClickUp».
- Cambia un tiempo en Automatizaciones y comprueba que el mapa lo muestra (Ejecución → «Empezar / Más tarde»).
- `node scripts/check-architecture-map.js` debe terminar con «Mapa Visual OK».

## Pendientes detectados
- Textos de «Respuesta» y «Devuelto» fijos en el código; columnas obsoletas de Telegram; datos y tareas de prueba; festivos (todo ya visible en el nodo «Deuda técnica»).
- La comprobación valida presencia y coherencia, no que las descripciones sigan siendo ciertas: hay que releerlas al cambiar un proceso.
- Para el SEO la comprobación no comprueba nada todavía (solo Operaciones).
