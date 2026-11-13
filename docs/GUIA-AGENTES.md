# Tus agentes: guía rápida

**Para:** Enric · **Desde:** 13 nov 2026

## Hablar con el agente principal (Operations manager)
- **Por Telegram:** escríbele al bot como a una persona o mándale un **audio**.
  - Te contesta por escrito.
  - Si le hablaste en audio, o le pides «respóndeme en audio», también con una nota de voz.
  - Arriba de la respuesta verás lo que entendió de tu audio (🎙 «…»), por si se equivocó.
- **Por correo:** escribe a `agente@equipo.kijutech.com` desde tu dirección y te responde en el mismo hilo.
  - Solo con correos autenticados de tu dirección: un correo falsificado no le da órdenes.
- **Desde la web:** en **Agentes → Probar** (en cada ficha).

## Qué puedes pedirle
| Para… | Ejemplos |
|---|---|
| Saber cómo va todo (contesta al momento) | «¿Cómo va el equipo hoy?», «¿Qué tiene Eury vencido?», «¿Qué me espera?», «¿Cómo va el gasto de IA y del servidor?», «Resúmeme la semana», «¿Quién tiene vacaciones este mes?», «¿Qué sabemos de CM Ibérica?» |
| Mandar trabajo (te llega propuesta con botones ✅ / ✖️) | «Que Jesús revise mañana el formulario de CM Ibérica», «Pasa el artículo de Athos a Mayelin», «Mueve lo del banner al viernes», «Comenta en la tarea del formulario que el cliente ya mandó las fotos», «Mayelin está de vacaciones del 22 al 31 de diciembre» |
| Encargar un análisis a un subagente (el informe llega en unos minutos) | «Revisa el último artículo de la web de Athos y dime si está bien», «Mira la landing de RF Serveis y dime qué mejorarías» |
| Datos de SEO y analítica (cuando conectes las integraciones) | «¿Quién posiciona para "pilates bilbao"?», «Volumen de estas keywords…», «¿Cómo van los clics de la web de X en Search Console este mes?», «¿Qué dice Clarity de la home?» |

## Cómo decide
- **Lo que solo consulta** lo hace directamente.
- **Lo que cambia algo** (ClickUp, calendario) te lo **propone con botones** y no lo hace hasta que pulsas ✅.
  - La autonomía se ajusta **por herramienta** en Agentes, con tres niveles:
    - con tu aprobación;
    - autónomo;
    - en sombra.
  - **Operaciones → Agente** mide cuánto aciertan y te propone subirles la autonomía los lunes.
- **Si le falta un dato** (quién, qué cliente, para cuándo), pregunta antes.
- **Lo que lee de webs o correos** lo trata como datos: no obedece instrucciones que vengan dentro.

## Crear agentes con rol
En **Agentes → Nuevo agente**:
- nombre y rol;
- instrucciones (su criterio y el formato de su informe);
- herramientas;
- modelo (opcional) y presupuesto mensual.

**Subagentes** (los que hacen trabajos que encarga el principal):
- **«Revisor web»:** ya está creado.
- **Ideas:** «Redactor SEO» (artículos con el tono de cada cliente), «Auditor de Search Console», «Analista de campañas».

## Integraciones (Agentes → Integraciones)
- **DataForSEO:** usuario y contraseña de la API (se comprueban y se ve el saldo).
- **Microsoft Clarity:** token de la Data Export API del proyecto.
- **Google:** Search Console, Analytics 4 y Business Profile.
  - Crea un cliente OAuth en Google Cloud con la URI de redirección que indica la pantalla.
  - Pega el Client ID y el secret, y pulsa «Conectar con Google».
  - Business Profile requiere que Google apruebe el acceso a su API (formulario aparte).

## Costes
- Cada mensaje cuesta unos **0,01–0,03 $**; un informe de subagente, **0,05–0,15 $**.
- Los audios cuestan céntimos por minuto (precio aproximado de OpenAI).
- Todo cuenta en **Sistema → Gasto de IA**, y cada agente tiene su presupuesto mensual en su ficha.
