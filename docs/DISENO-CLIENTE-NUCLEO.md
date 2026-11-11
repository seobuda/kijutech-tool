# Diseño: el cliente en el núcleo (análisis «como un equipo de producto tipo Ahrefs/Semrush»)

**Fecha:** 2026-11-11 · **Estado:** propuesta decidida por Claude Code con autorización de Enric («encárgate de todo»);
la migración se aplica solo en local y con backup; producción queda para cuando Enric confirme el despliegue.

## 1. El problema

Hoy hay dos «clientes» que no se conocen:

- `ops_clients` (Operaciones, 52 fichas): nombre, alias, nivel, plazo, servicios, listas de ClickUp, alertas.
- `projects` (núcleo, 1 fila): lo usa el módulo SEO como «proyecto».

La estrategia viva, los conectores de Google y el agente de alta necesitan **un único cliente** que vean todos los
módulos, sin que un módulo importe a otro.

## 2. Cómo lo resuelven los productos de referencia

| Producto | Modelo | Qué copiamos |
|---|---|---|
| **Semrush** | *Project* = un dominio; cada herramienta (Site Audit, Position Tracking…) se activa y configura dentro del proyecto. Las agencias tienen además «clientes» (Agency Growth Kit / CRM) que agrupan proyectos. | Separar **cliente** (la empresa) de **activo** (el dominio u otra propiedad sobre la que trabajan las herramientas). |
| **Ahrefs** | *Project* = un objetivo verificado (dominio, subdominio o carpeta); las herramientas cuelgan del proyecto; el panel muestra un widget por herramienta. | Las herramientas trabajan sobre un **activo**, no sobre el cliente; la ficha muestra «widgets» que aporta cada módulo. |
| **AgencyAnalytics / Looker Studio / HubSpot** | Las **integraciones se conectan una vez a nivel de agencia** (OAuth) y luego se **asigna cada propiedad** (sitio de Search Console, propiedad de GA4, ficha de Google, cuenta de Ads) a un cliente. Métricas en una tabla de series temporales común. | Conectores a nivel de cuenta + **mapeo de propiedades a clientes** + **una tabla de métricas diaria** común. |

Lección común: **cliente ≠ dominio ≠ integración**. Mezclarlos es lo que obliga a rehacer el modelo cuando un cliente
tiene dos webs, una ficha de Google por local o dos cuentas de Ads.

## 3. Alternativas evaluadas

| Opción | Resultado |
|---|---|
| A. Cliente en el núcleo, módulos con `client_id` | Correcto, pero incompleto: no resuelve varios dominios/propiedades por cliente. |
| B. Vincular `ops_clients` ↔ `projects` | Dos fichas que se desincronizan. Descartada. |
| C. Estrategia lee `ops_clients` | Rompe la regla de módulos. Descartada. |
| **A+ (elegida)** | A más **activos del cliente** y **identificadores externos**, el patrón de Semrush/Ahrefs/AgencyAnalytics. |

Cuestionada tres veces:
1. *¿Sobra la tabla de activos ahora?* No: el agente de alta empieza por «dame el dominio», y Search Console/GA4/ficha
   de Google son activos del cliente. Añadirla después obligaría a migrar otra vez.
2. *¿Por qué no hacer de `projects` el cliente?* Porque `projects` ya significa «un trabajo SEO» con etapas y
   `project_modules`; un cliente puede tener SEO y Ads a la vez. `projects` pasa a ser **el proyecto de un cliente**
   (`projects.client_id`).
3. *¿Riesgo de la migración?* Bajo si **el cliente del núcleo reutiliza el mismo UUID** que `ops_clients`: todas las
   claves `ops_client_id` existentes siguen siendo válidas sin reescribir filas.

## 4. Modelo final

```
tenants
 └─ clients                     (núcleo) id = mismo UUID que ops_clients · nombre · alias · dominio principal · activo
     ├─ client_assets           (núcleo) tipo: domain | gsc_site | ga4_property | gbp_location | ads_account · valor · principal
     ├─ client_external_ids     (núcleo) sistema: clickup_field_option | clickup_folder | … · id externo
     ├─ client_contacts         (núcleo; hoy ops_client_senders)  correos y dominios de contacto
     ├─ client_memory           (núcleo; hoy ops_client_memory)   hechos aceptados/propuestos
     ├─ projects.client_id      (núcleo) proyectos SEO (y futuros) de ese cliente
     │
     ├─ ops_client_settings     (Operaciones; hoy ops_clients)    nivel, plazo, servicios, listas, alertas
     ├─ ops_requests / ops_inbound_emails / ops_client_activity → client_id
     ├─ est_*                   (Estrategia, futuro)              objetivos, KPIs, iniciativas → client_id
     └─ int_metrics_daily       (Conectores, futuro)              client_id · asset_id · fuente · métrica · fecha · valor
```

Reglas:
- El núcleo no conoce a los módulos; los módulos guardan `client_id`.
- La ficha del cliente (núcleo) pinta pestañas que **declara cada módulo en su manifiesto** (como los widgets de Ahrefs).
- Las integraciones se conectan una vez por cuenta y se **asignan** a un cliente como activos.

## 5. Plan de migración (por fases, sin romper nada)

1. **Fase 1 (sin borrar nada):** crear `clients`, `client_assets`, `client_external_ids`; copiar las 52 fichas con el
   mismo UUID; añadir `projects.client_id` (nullable). Operaciones sigue leyendo `ops_clients` (que queda como
   ajustes del módulo). Backup previo obligatorio.
2. **Fase 2:** mover contactos y memoria al núcleo (`client_contacts`, `client_memory`), con vistas de compatibilidad
   o cambiando las lecturas en el mismo paso.
3. **Fase 3:** renombrar `ops_clients` → `ops_client_settings` y quitar de ella nombre y alias (los da el núcleo);
   ficha de cliente del núcleo con pestañas de módulos.

Se ejecuta justo antes del paso 6 de la hoja de ruta (Estrategia viva). No bloquea los pasos 1-5.
