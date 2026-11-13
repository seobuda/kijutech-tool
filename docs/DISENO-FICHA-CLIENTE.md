# Diseño: la ficha del cliente completa, en el núcleo

**Fecha:** 2026-11-14
**Estado:** aprobado por Enric el 14 nov (núcleo, contrato solo para administradores y sección propia en el menú). Pasos 1 a 3 construidos en `feature/ficha-cliente-nucleo` (migración 0048).

Sustituye y amplía `docs/DISENO-CLIENTE-NUCLEO.md` (11 nov). Aquel diseño nunca se aplicó.

## 1. Por qué

Hoy la ficha del cliente (`ops_clients`) es una tabla del módulo Operaciones, pensada para repartir trabajo: nivel, plazo, servicios, listas de ClickUp y unos textos de negocio. Le faltan:

- **las personas** del cliente: quién decide, quién paga, el teléfono, el canal preferido;
- **sus webs, perfiles y cuentas:** varias webs, fichas de Google por local, Search Console, Analytics, Ads, redes y CRM, y si tenemos acceso a cada una;
- **la competencia**;
- **los datos de empresa y contrato**;
- **el estado del cliente:** prospecto, onboarding, activo, pausado o baja.

Además, la ficha vive dentro de Operaciones. Los agentes, SEO y la futura Estrategia la necesitan, y por la regla de módulos no pueden leer tablas de Operaciones.

La fase 1 de «fichas por Telegram» lo resolvía metiendo la web en «herramientas» y el teléfono en las notas. **Es un parche:** el diseño correcto es una ficha completa en el núcleo.

## 2. Qué hacen los productos de referencia

| Producto | Qué copiamos |
|---|---|
| HubSpot / Pipedrive (CRM) | **Empresa ≠ personas de contacto**: una empresa tiene varios contactos con rol (decisor, facturación, técnico) y canal preferido. Ciclo de vida (*lifecycle stage*). |
| Semrush / Ahrefs | **Cliente ≠ activo:** las herramientas trabajan sobre un dominio u otra propiedad, y un cliente puede tener varias. |
| AgencyAnalytics / Looker Studio | **Integraciones conectadas una vez por agencia**, y luego se **asigna** cada propiedad (sitio de Search Console, propiedad de GA4, ficha de Google, cuenta de Ads) a un cliente. |
| Gestores de agencia (Teamwork, Productive) | **Contrato** (servicios, cuota, inicio y renovación) y **onboarding** como lista de pasos con estado. |

## 3. Alternativas

| Opción | Coste | Riesgo | Qué se pierde |
|---|---|---|---|
| **A. Ampliar `ops_clients`** con columnas (web, teléfono, dirección…) y JSON para contactos | Bajo (1 migración aditiva) | Bajo | El cliente sigue siendo de Operaciones: agentes, SEO y Estrategia no pueden usarlo sin saltarse la regla de módulos. Una web o un local por cliente; mezcla persona con empresa. Habría que rehacerlo al hacer Estrategia u onboarding. |
| **B. Cliente en el núcleo con tablas hijas** (empresa, contactos, activos, competencia y memoria) y Operaciones solo con sus ajustes | Medio-alto: migración, 11 archivos que leen el cliente y la pantalla nueva | Medio, mitigado: el mismo identificador (UUID), copia de seguridad previa, una capa de compatibilidad (`listClients` devuelve la misma forma) y pruebas | Nada. Es la base del onboarding, de Estrategia y de las integraciones por cliente. |
| **C. Dejarlo como la fase 1** (parche en notas y herramientas) | Cero | Datos sin estructura que luego habrá que migrar a mano | Lo que pides: ficha completa, integraciones por cliente, onboarding con datos fiables. |

**Recomendada: B.**

La he cuestionado tres veces:

1. **¿Cumple el objetivo final o solo el de hoy?** El objetivo es que Operaciones sustituya a una persona y que el onboarding lo hagan agentes. Los agentes necesitan saber qué web auditar, qué propiedad de Search Console leer y quiénes son los competidores, sin adivinar nada en las notas. Solo B les da eso con estructura.
2. **¿Qué coste oculto tiene a semanas vista?** Con A, el coste aparece al hacer Estrategia, varios locales o varias webs: segunda migración y reescritura. Con B, el coste está ahora y acotado. La migración copia 52 fichas con el mismo identificador, así que las referencias existentes (encargos, correos, actividad) siguen valiendo sin reescribir filas.
3. **¿Hay algo que ya tenemos y no estamos usando?** Sí, y B lo aprovecha:
   - la memoria y los contactos ya existen: se **mueven** al núcleo, no se rehacen;
   - la conexión con Google ya existe a nivel de agencia (Agentes → Integraciones): solo falta **asignar** propiedades a cada cliente;
   - `projects` (SEO) ya existe: gana un `client_id`.

## 4. Modelo propuesto

```
clients  (NÚCLEO · mismo id que ops_clients)
│  Identidad:  nombre comercial · alias · logo (URL) · sector · descripción corta
│  Estado:     prospecto | onboarding | activo | pausado | baja · fecha de alta · fecha de baja · motivo de baja
│  Empresa:    razón social · CIF · dirección fiscal · web principal (atajo)
│  Negocio:    a qué se dedica · qué vende · zona · público · propuesta de valor · tono y marca
│  Estrategia: objetivos · estrategia actual · notas
│  Contrato:   servicios contratados (texto) · cuota mensual (opcional) · inicio · renovación
│
├─ client_contacts     personas: nombre · cargo · rol (decisor | facturación | técnico | marketing | otro)
│                      email · teléfono · WhatsApp · canal preferido · principal · notas
│                      → sustituye a ops_client_senders (los correos para reconocer remitentes salen de aquí)
├─ client_locations    locales o sedes: nombre · dirección · ciudad · CP · país · teléfono · horario · ¿principal?
├─ client_assets       webs y cuentas: tipo (web | dominio | search_console | analytics | business_profile |
│                      google_ads | meta | instagram | tiktok | linkedin | youtube | tienda | crm | otro)
│                      nombre · URL o identificador externo · acceso (sí | pendiente | no | no aplica)
│                      dónde están los accesos (texto, NUNCA la contraseña) · principal · notas
│                      · reconocer correos de este dominio (solo webs y dominios)
├─ client_competitors  nombre · dominio · notas · origen (manual | agente)
├─ client_memory       (se mueve de ops_client_memory, mismos datos y reglas)
│
├─ projects.client_id  proyectos SEO de ese cliente
└─ ops_clients         (Operaciones, solo ajustes): nivel · plazo · servicios con responsable ·
                       espacio y listas de ClickUp · opción «Cliente» de ClickUp · alertas · horas · días
```

### Reglas

- **El núcleo no conoce a los módulos; los módulos guardan `client_id`.** Operaciones guarda sus ajustes en `ops_clients`, con el mismo id.
- **Nunca contraseñas.** En los activos solo va *dónde* están los accesos (p. ej. «en el gestor de la agencia»). Se mantiene la comprobación automática que ya rechaza contraseñas.
- **Datos personales mínimos** (RGPD): nombre, cargo y medios de contacto profesionales; nada de DNI ni datos personales que no hagan falta para trabajar. Al borrar un cliente, se borran sus contactos en cascada.
- **Integraciones disponibles por cliente:** se deducen de los activos. Si el cliente tiene asignada una propiedad de Search Console y la conexión de Google de la agencia está activa, sus herramientas usan esa propiedad sin preguntar. La ficha muestra qué datos pueden sacar los agentes de ese cliente.
- **Ficha completa al X %:** un indicador de qué falta (contacto principal, web, objetivos, Search Console…). El agente lo usa para preguntar lo que falta, y el equipo lo ve como progreso, no como reproche.

## 5. Pantalla

**Clientes** pasa a ser una sección propia del menú (`/dashboard/clientes`). Hoy está dentro de Operaciones. La ficha tiene pestañas:

1. **Resumen:** estado, contacto principal, web, servicios, completitud, últimos encargos y alertas.
2. **Empresa y negocio:** identidad, empresa, negocio, estrategia y contrato.
3. **Contactos:** personas y locales.
4. **Webs y cuentas:** activos con su acceso, e integraciones disponibles para este cliente.
5. **Competencia.**
6. **Memoria.**
7. **Operaciones:** nivel, plazo, servicios con responsable, ClickUp, alertas y trabajo del mes. Es la pestaña que aporta el módulo.

Con «Rellenar con IA» (texto o audio) en cada pestaña, y la misma propuesta por Telegram con el agente.

## 6. El agente con la ficha nueva

Sustituye a la fase 1 (que no se despliega tal cual):

- `crear_cliente` y `actualizar_cliente` escriben en su sitio: contactos en contactos, web en activos, local en locales, competidores en competencia. Siempre con vista previa y ✅ / ✖️.
- `ficha_cliente` devuelve la ficha completa con su completitud, para que el agente pregunte lo que falta.
- Lo que deduce de la web del cliente (negocio, oferta, zona, competidores) queda marcado como tal, o con origen «agente» en el caso de la competencia.

## 7. Plan por fases

| Paso | Qué | Esquema |
|---|---|---|
| **1** | Migración: `clients` y sus 4 tablas hijas, mover memoria y contactos, `projects.client_id`, quitar de `ops_clients` lo que pasa al núcleo. Copia de las 52 fichas con el mismo id. Capa de compatibilidad para que encargos, correos, avisos, alertas y agentes sigan funcionando igual. | **Sí** (backup previo) |
| **2** | Pantalla **Clientes** con las pestañas, «Rellenar con IA» por pestaña y completitud. | No |
| **3** | Agente: herramientas de ficha sobre el modelo nuevo (rehace la fase 1). | No |
| **4** | Asignar propiedades de Google (Search Console, GA4, Business Profile) a cada cliente desde la ficha, y que las herramientas de integración las usen solas. | No |
| **5** | Onboarding con subagentes: auditor técnico, competencia y contenido. Informe conjunto en la ficha y tareas propuestas. | Posible: tabla de pasos del onboarding (se decide entonces) |

Los pasos 1 a 3 van juntos en una rama y se despliegan a la vez: no tiene sentido una ficha nueva sin pantalla ni agente.

## 8. Por verificar

- Si la API de ClickUp permite crear opciones en el campo «Cliente». No verificado: hasta comprobarlo, la opción se crea en ClickUp a mano y se vincula.
- Volumen real de datos: 52 fichas, sus contactos y su memoria. Se mide en el backup antes de migrar.
