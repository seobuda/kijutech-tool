# Diseño: motor de acciones del agente (propuesta → aprobación → ejecución → métricas)

**Fecha:** 2026-11-11 · **Estado:** aprobado por Enric («haz lo pendiente, quiero que todo quede listo»); se construye en
`feature/motor-acciones` con backup previo, como paso 2 de la hoja de ruta.

## 1. Para qué

Hoy cada función del agente decide a su manera si actúa sola o pregunta (bloqueos con IA, convertir notas y, pronto,
responder correos). No hay forma de medir cuánto acierta, y por tanto no se puede subir su autonomía con datos. Enric quiere:
- aprobar con **un botón de Telegram** lo que el agente propone (o corregirlo);
- un **panel del agente** con estadísticas: propuestas, aprobadas a la primera, corregidas, rechazadas, tiempo de decisión;
- poder **subir la autonomía por tipo de acción** cuando el acierto lo justifique.

## 2. Alternativas (cuestionadas tres veces)

| Opción | Problema |
|---|---|
| Columnas de «aprobado/corregido» en cada tabla (`ops_blockers`, `ops_notes`, `ops_inbound_emails`) | Métricas dispersas; cada función nueva repite la lógica y el panel tiene que unir N tablas. |
| Reutilizar `ops_request_events` | Es un registro de lo que hace el equipo, no de decisiones sobre propuestas; mezclarlo ensucia el Piloto. |
| **Una tabla común `ops_agent_actions` + ejecutores por tipo (elegida)** | Una sola fuente para el panel y para la autonomía; cada función nueva solo registra su propuesta y su ejecutor. |

1. *¿Sirve para el objetivo final o solo para hoy?* Sirve para el final: el correo (paso 3), la estrategia (paso 6) y el
   agente de alta (paso 8) serán tipos de acción nuevos sobre el mismo motor.
2. *¿Coste oculto?* Una tabla y un tipo de aviso nuevo; el riesgo es que el motor se convierta en un «todo vale». Se evita
   con tipos cerrados (CHECK) y un ejecutor registrado por tipo.
3. *¿Lo que ya tenemos?* Los botones y conversaciones pendientes de Telegram, la cola `ops_notifications` y los niveles
   «sombra / con aprobación / autónomo» ya acordados el 6 nov. Se reutiliza todo.

## 3. Modelo

`ops_agent_actions`: `tenant_id`, `kind` (CHECK: `blocker_answer`, `note_conversion`; ampliable), `status`
(`propuesto` → `aprobado` | `corregido` | `rechazado` | `auto` → `ejecutado` | `fallido`), `autonomy` en el momento
(`sombra` | `aprobacion` | `autonomo`), `summary` (texto corto), `proposal` (jsonb), `final` (jsonb, lo que se ejecutó),
referencias opcionales (`request_id`, `blocker_id`, `note_id`), `decided_by_name`, `decided_via` (`telegram` | `panel` |
`agente`), `decided_at`, `executed_at`, `error`, `dedupe_key` única, `created_at`.

Autonomía por tipo: en `ops_settings` (`agent_autonomy:<kind>`), editable en la pestaña nueva **Agente** (solo admin).

## 4. Flujo

1. La función crea la propuesta (`proposeAction`). Según la autonomía:
   - `autonomo`: se ejecuta y queda `auto` (se mide igual: Enric puede marcarla después como incorrecta);
   - `aprobacion`: aviso a Enric con **✅ Aprobar · ✏️ Corregir · ✖️ Descartar**;
   - `sombra`: no se ejecuta; solo se guarda para medir (y se compara con lo que hizo el humano).
2. Aprobar → ejecutor → `aprobado` + `ejecutado`. Corregir → el bot pide el texto → ejecutor con la corrección → `corregido`.
   Descartar → `rechazado` (y la función sigue su camino manual).
3. Todo con transiciones atómicas (condicionadas al estado) y clave única: pulsar dos veces no ejecuta dos veces.

## 5. Primeros tipos

- **`blocker_answer`**: cuando la IA propone una respuesta a un bloqueo pero no puede enviarla sola (fuente en comentarios o
  autonomía «con aprobación»), Enric la aprueba con un botón en vez de escribirla. Si la escribe él, cuenta como corregida.
- **`note_conversion`**: al enviar los encargos de una nota se compara lo que propuso la IA con lo que se envió (título, lista,
  responsable, fecha): igual = aprobado a la primera; distinto = corregido; encargos quitados = rechazados en parte.

## 6. Panel «Agente» (pestaña de Operaciones)

StatCards (propuestas 30 días, acierto a la primera, corregidas, rechazadas, tiempo medio de decisión), tabla por tipo con su
nivel de autonomía y una recomendación («≥ 95 % de acierto en ≥ 30 propuestas: puedes subirla a autónomo»), y lista de
las últimas acciones con su propuesta y lo que se hizo.
