# Checklist para auditar los agentes de la plataforma

Adaptada y resumida de `skills/agent-architecture-audit` de ECC (commit 4adeee67; ver `docs/auditoria-ecc.md`), con
nuestras piezas y los huecos que ya encontró esa auditoría. Es un documento, no una skill: no carga contexto.
**Cuándo usarla:** al crear o cambiar un agente, una herramienta o un canal (Telegram, correo, ClickUp), y una vez al
cerrar cada módulo.

## Las 12 capas donde se puede estropear una respuesta, y dónde están en nuestro código

| # | Capa | Qué falla | Dónde mirar aquí |
|---|---|---|---|
| 1 | Instrucciones del agente | Órdenes que se contradicen, instrucciones infladas | `lib/agentes/store.ts` (instrucciones por defecto), prompts en la tabla de prompts |
| 2 | Historial de la conversación | Contexto viejo que se cuela en un turno nuevo | `agt_messages`, armado del historial en `lib/agentes/engine.ts` |
| 3 | Memoria larga | Temas antiguos en conversaciones nuevas; la corrección de Enric no gana a lo viejo | memoria de cliente (`addMemory`), base de conocimiento `kb_*`, casos anteriores |
| 4 | Resúmenes | Un resumen vuelve a entrar como si fuera un hecho | expedientes, informes de Estrategia, «lo que sabe SEO» |
| 5 | Recuperación | Capas de resumen repetidas que gastan contexto | `buscar_conocimiento`, `casos_anteriores`, embeddings |
| 6 | Elección de herramienta | El modelo se salta una herramienta obligatoria | herramientas por agente (`agent.tools`) |
| 7 | Ejecución | Dice que hizo algo que no hizo | `engine.ts` (solo ejecuta lo de `agent.tools`), `ops_agent_actions` |
| 8 | Lectura del resultado | Malinterpreta o ignora lo que devolvió la herramienta | resultados largos recortados, errores devueltos como texto |
| 9 | Forma de la respuesta | Formato roto | salidas validadas con zod (correo), JSON del estratega |
| 10 | Transporte | Telegram, el correo o la web cambian una respuesta correcta (markdown, cortes, longitud) | `lib/operaciones/telegram*`, plantillas de correo |
| 11 | Reparaciones ocultas | Una segunda pasada de IA o un reintento silencioso cambia la respuesta | proveedor de reserva de `callAI` (`gateway.ts` `shouldFallback`) |
| 12 | Persistencia | Estado caducado o caché reutilizados como prueba actual | caché de ClickUp, `requestStatus`, instantáneas |

## Patrones de fallo que buscar
1. **Disciplina de herramientas:** algo que el prompt dice «debes usar X» pero el código no obliga. Lo obligatorio va en
   código (p. ej. `proposeOrRun` para todo cambio, la bandeja de salida para ClickUp), nunca solo en el prompt.
2. **Memoria contaminada:** lo último que dijo Enric o el cliente debe ganar a lo guardado; nada se guarda en memoria a
   partir de texto no fiable sin aprobación.
3. **Capas ocultas:** cualquier segunda llamada a IA (reserva, reintento, «arreglo») tiene que estar a la vista en
   `ai_jobs` y con su coste.
4. **Transporte:** probar la salida real en Telegram (longitud, markdown) y en el correo, no solo en los registros.
5. **Texto ajeno** (trifecta letal: datos privados + texto no fiable + poder enviar fuera): si un turno ha leído texto de
   terceros, ningún cambio ni envío sale sin aprobación. Hoy la marca `untrustedInput` solo salta con `web_fetch` y
   `web_search` (`engine.ts:172`): las herramientas propias que devuelven texto ajeno también deben activarla.
6. **Coste:** cada agente con presupuesto (el principal hoy no tiene); la comprobación también dentro del bucle, no solo
   al empezar; reintentar solo errores transitorios (nunca 400, 401 o 403).

## Búsquedas de evidencia (solo lectura)
```bash
# Obligaciones que solo están en el prompt
grep -rnE "debes usar|siempre usa|obligatorio" lib/agentes lib/operaciones
# Llamadas a IA fuera de callAI y del motor
grep -rnE "messages\.create|new Anthropic\(" lib --include=*.ts
# Reintentos y reservas
grep -rnE "fallback|retry|reintent" lib/ai lib/agentes
# Texto externo que entra en un prompt sin delimitar
grep -rnE "datos_no_fiables|DATO NO FIABLE" lib --include=*.ts
```

## Cómo se entrega
Una tabla de hallazgos con fichero:línea, capa, escenario de fallo y arreglo propuesto, con el mismo filtro de confianza
que el revisor de código (`.claude/agents/revisor-codigo.md`). Los arreglos que toquen el núcleo siguen el protocolo de
decisión de `CLAUDE.md`.
