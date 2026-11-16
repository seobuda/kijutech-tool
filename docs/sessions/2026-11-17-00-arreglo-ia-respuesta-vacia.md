# Arreglo: respuestas de IA vacías con Sonnet y Opus 5.5
**Fecha:** 2026-11-17  
**Rama:** fix/ia-respuesta-vacia  
**Commit:** e6b04d0d

## Qué se construyó

- `lib/ai/adapters/anthropic.ts`: nueva `anthropicText()`, que une todos los bloques `text` de la respuesta en vez de leer solo el primero. Si no hay texto, lanza un error con el motivo (límite de tokens, rechazo u otro), y la llamada queda como fallo en `ai_jobs` en vez de «completada» con texto vacío.
- `tests/ia-adaptador.test.ts`: 4 pruebas sin red (respuesta con pensamiento, sin pensamiento, sin texto y cortada).
- `docs/ESTADO.md`: línea en la cronología.

## Diagnóstico (producción, solo lectura, con permiso de Enric)

El 16 nov a las 19:35 Enric mandó un audio por Telegram: «crear una tarea para mañana para mí, formulario de la web de Atos, no funciona».

- La transcripción fue bien (`agt_voz_entrada`, completada).
- El agente usó `crear_encargo`, que llama a la conversión de notas (`ops_note_to_requests`, Sonnet 5.5). Esa llamada consta como **completada**, con 1.481 tokens de salida, pero con `output.content` **vacío**.
- `proposeRequests` no pudo leer el JSON y, como el texto no terminaba en `}`, dio el mensaje engañoso «la respuesta de la IA se cortó…». El agente contestó «no he podido crear la tarea».
- Causa: Sonnet 5.5 y Opus 5.5 piensan por defecto («adaptive thinking»). El primer bloque de la respuesta es `thinking` y el texto viene después. El adaptador leía `content[0].text`.
- Las conversiones del 9 nov funcionaron porque en notas sencillas el modelo a veces no piensa. El fallo es intermitente con Sonnet 5.5 y sería **permanente con Opus 5.5** (el estratega de la fase 2 de Estrategia, que siempre piensa).

## Migraciones aplicadas

Ninguna.

## Decisiones técnicas tomadas en auto mode

- **Error en vez de texto vacío:** una respuesta sin texto ahora es un fallo con motivo. Así queda registrada en `ai_jobs` y el gateway puede pasar al proveedor de reserva si lo hay.
- **Una respuesta cortada con algo de texto se sigue devolviendo:** quien llama ya detecta el corte (como `proposeRequests`).
- **Rama propia desde `main`** (`fix/ia-respuesta-vacia`), separada de `feature/estrategia-fase2`. La rama de Estrategia necesitará este arreglo al fusionarse.

## Qué verificar manualmente

1. Tras desplegar, mandar por Telegram un audio o un texto pidiendo una tarea («crea una tarea para mí para mañana en la lista Pruebas Kiju…»). Debe llegar la propuesta con botones.
2. En la base: `select created_at, function, status, error, output->>'content' is not null and output->>'content' <> '' as con_texto from ai_jobs order by created_at desc limit 5;`

## Pendientes detectados

- **Registro central de errores** (propuesto a Enric): hoy los fallos quedan repartidos en `ai_jobs`, `agt_messages`, `ops_health_incidents` y los logs de Docker, que se pierden al recrear el contenedor. Si falla la transcripción, el mensaje ni se guarda en la conversación (`lib/agentes/inbound.ts`, línea 49). Fallos como este, una IA que «completa» sin texto, no los ve nadie.
- El mensaje «la respuesta de la IA se cortó» de `proposeRequests` se daba también con una respuesta vacía. Con el arreglo ya no pasa, porque una respuesta vacía es un error del gateway.
- Mapa Visual sin cambios (no hay pasos nuevos); `node scripts/check-architecture-map.js` OK; `pnpm test` 336/336.
