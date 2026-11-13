# Vigía del gasto de IA, IA de reserva y reasignar desde el parte

**Fecha:** 13 nov 2026 · **Pedido por Enric:** «la herramienta debería saber el saldo disponible de la API… predecir e informar
de grandes gastos, analizar por qué algo provocó tanto gasto, proponer mejoras… es parte del motor de toda la herramienta».

## Lo que permite Anthropic (verificado en la documentación oficial, 13 nov)
- **No hay endpoint de saldo de créditos.** No se puede preguntar «cuánto me queda». Se trabaja con un **presupuesto** (80 $/mes).
- **Informe de costes** (`GET /v1/organizations/cost_report`):
  - diario y en USD; el importe viene en centavos, como texto;
  - datos con unos 5 min de retraso; se puede consultar como mucho 1 vez por minuto;
  - necesita una **clave de administración** (`sk-ant-admin…`) que crea un administrador de la organización en la consola;
  - **no funciona en cuentas individuales:** hay que tener una organización;
  - incluye **todo** lo que gasta la cuenta: la herramienta, Claude Code con clave de API y cualquier otra clave.
- **Límites de gasto:** solo existen en vista previa para algunas organizaciones. No se usan.
- **Ojo con «la API de Claude Code»:** la suscripción de Claude Code (Pro/Max) no es la API. Si los 80 $ son el límite o la
  recarga de la cuenta de la consola, el informe de costes los cubre. Si son la suscripción, no salen en la API.

## Recomendación: un vigía con reglas sobre nuestros datos y, opcional, el coste real de la cuenta
- **Datos propios (`ai_jobs`):** cada llamada de la herramienta, con su función, modelo, tokens, coste estimado, fallo y reserva.
  - Con ellos se calculan la previsión, los picos con su porqué y las recomendaciones.
- **Coste real de la cuenta**, si Enric conecta la clave de administración:
  - con él se calculan el presupuesto y la previsión de la cuenta entera;
  - se ve qué parte no es de la herramienta.
- **Sin IA**: son cuentas y reglas (directiva de optimización de IA). Un «analista con IA» gastaría justo lo que vigila.

**Alternativas descartadas:**

| Alternativa | Por qué no |
|---|---|
| Plataforma externa de costes (Vantage, Datadog, CloudZero…) | De pago, los datos salen a un tercero y no sabe qué función de la herramienta gastó (solo ve la cuenta). |
| Analista con IA que lea los registros | Cuesta dinero cada vez que analiza. Lo que hay que explicar (más llamadas, más tokens, fallos) se calcula exacto con reglas. |
| Solo la consola de Anthropic | Hay que entrar a mirar, no avisa por Telegram y no dice qué función ni por qué. |
| No hacer nada | Un bucle o un pico de correos se descubriría en la factura. |

**Cuestionado tres veces:**
1. *¿Sirve al objetivo final?* Sí: avisa sin que mires y dice qué tocar. La autonomía no depende de que entres en una consola.
2. *¿Riesgo oculto?* El coste propio es una **estimación** con la tabla de precios. Por eso conviene conectar la clave de
   administración, para comparar con lo real y cubrir Claude Code.
3. *¿Hay algo que ya tengamos?* Sí: `ai_jobs` lo registraba todo. Solo faltaba leerlo con criterio.

## IA de reserva
- Si el proveedor principal falla por su culpa, se prueba **una vez** con otra clave activa de **otro proveedor**. Cuenta como fallo
  del proveedor:
  - caído o saturado (5xx, 529) o con límite (429);
  - clave rechazada (401/403) o modelo retirado (404);
  - sin saldo (400 con «credit/balance»);
  - tiempo agotado o error de red.
- Una petición mal formada no cambia de proveedor.
- Queda anotado en el job (`output.fallback`) y el vigía lo cuenta y lo recomienda revisar.
- **Requisito:** tener configurada en IA y modelos una segunda clave con saldo (OpenAI, Gemini o DeepSeek). Sin ella, la reserva
  no tiene a dónde ir. Hoy la clave de Gemini no tiene créditos.
- El clustering de SEO resuelve el proveedor por su cuenta y no usa la reserva todavía.

## Reasignar desde el parte de la mañana
- Migración 0046 (aprobada por Enric): la bandeja de salida hacia ClickUp acepta `set_assignee`.
- **Botón «👤 A <persona>»:** sale junto a «📅 Mañana» en cada tarea que se cae por una ausencia.
  - Quita a la persona ausente, pone a la sugerida y la vigilancia de ClickUp avisa a la nueva.
  - Nada se reasigna sin la pulsación del dueño.
