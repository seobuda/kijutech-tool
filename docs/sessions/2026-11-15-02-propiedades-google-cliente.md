# Propiedades de Google por cliente (paso A de las métricas de cliente)
**Fecha:** 2026-11-15  
**Rama:** feature/cliente-propiedades-google  
**Commit:** e32b989d

## Qué se construyó
Primera sesión trabajada desde el móvil con Remote Control.

- `lib/core/capabilities.ts`: registro `registerAssetDirectory` / `assetDirectories`. Un módulo con una integración ofrece las propiedades que ve, y el núcleo no sabe de Google.
- `lib/core/client-directory.ts` (nuevo):
  - `directoryAssets`, con caché de 5 minutos por cuenta;
  - `suggestAssets`, que empareja por el dominio de sus webs, sin IA;
  - `addDirectoryAssets`, que solo añade lo que la integración ve de verdad;
  - `checkAccess`, que marca «Tenemos acceso» o «Sin acceso».
- `lib/core/client-rules.ts`:
  - nuevas: `ExternalAsset`, `sameSite`, `assetKey`, `matchExternalAssets`, `accessFromDirectory`, `pickClient`;
  - movidas desde `lib/operaciones/clients.ts`, que ahora las reexporta: `normText`, `baseName`, `findClientByName`, `findClientInText`.
- `lib/core/clients.ts`: `findCoreClient`, para buscar un cliente por nombre desde cualquier módulo.
- `lib/core/client-actions.ts`: `listDirectoryAssetsAction`, `suggestClientAssetsAction`, `addDirectoryAssetsAction` y `checkClientAccessAction`, todas con permiso `edit`.
- `lib/agentes/integrations.ts`:
  - listas estructuradas `gscSiteList`, `ga4PropertyList` (con la web de su flujo de datos) y `gbpLocationList` (con su web);
  - `gbpPerformance` y `sumGbpSeries` (API Business Profile Performance, `fetchMultiDailyMetricsTimeSeries`).
- `lib/agentes/register.ts`:
  - registra el directorio de Google;
  - `resolveGoogleId`: el agente pasa «cliente» y se usa su propiedad principal; si falta, lo dice en vez de adivinar;
  - `gsc_rendimiento` y `ga4_informe` aceptan «cliente»;
  - nueva `gbp_rendimiento`.
- `lib/agentes/store.ts`: las tres herramientas se añaden al Operations manager, con la actualización única `2026-11-15-google-por-cliente` y en los agentes por defecto.
- `app/(dashboard)/dashboard/clientes/[id]/google-props.tsx` (nuevo):
  - panel «Cuentas de Google de este cliente», con «Buscar en Google» y «Comprobar accesos»;
  - desplegable «Elegir de Google…» en el formulario.
- `[id]/tab-webs.tsx`: los integra; el texto de ejemplo de Business Profile pasa a `locations/…`.
- Tests: `tests/agentes.test.ts` incluye pruebas puras (dominios, identificadores, sugerencias, acceso, cliente por nombre, suma de series) y con la base de datos (sugerir, añadir solo lo que Google ve, comprobar accesos, el agente usa la propiedad de la ficha y no adivina). `tests/seguridad.test.ts` incluye los guards de las 4 acciones nuevas.
- Mapa: paso nuevo `cli-propiedades-google` en el mapa de clientes y la descripción de integraciones actualizada en el de Agentes. La comprobación pasa.
- `docs/ESTADO.md` (§6.22, cronología, mapa de archivos) y `docs/PENDIENTES-ENRIC.md`.

## Migraciones aplicadas
Ninguna. El identificador de cada propiedad cabe en `client_assets.value`, que ya existía.

## Decisiones técnicas tomadas en auto mode
- **Cómo se enlazan Clientes y Google.** La pantalla de clientes es del núcleo y Google pertenece al módulo Agentes. Para no acoplarlos se creó un registro en el núcleo (`registerAssetDirectory`), por el mismo camino que `registerClientDeleteGuard`. La ficha ya importaba `isConnected` de Agentes para mostrar qué está conectado; eso se deja como estaba y se apunta como deuda.
- **Búsqueda de clientes por nombre.** El agente de Agentes necesita encontrar un cliente por su nombre, pero esa lógica estaba en Operaciones y un módulo no puede importar otro. Se ha movido al núcleo, como funciones puras, sin cambiar su comportamiento.
- **Emparejar sin IA.** Basta con comparar dominios: el sitio de Search Console, la web del flujo de datos de Analytics y la web de la ficha de Business Profile. Coste cero.
- **No fiarse del navegador.** «Añadir a la ficha» vuelve a comprobar en el servidor que la propiedad está en lo que ve Google.
- **Comprobar accesos.** «Pedido, pendiente» no pasa a «Sin acceso» hasta que aparezca, porque es una petición en curso. Si Google falla al listar un tipo, no se toca ninguna cuenta de ese tipo.
- **Business Profile.** Se usa `fetchMultiDailyMetricsTimeSeries` con el mismo permiso que ya teníamos (`business.manage`). El periodo acaba hace 3 días por el retraso de los datos. Un valor ausente cuenta como 0, como indica la documentación de Google.
- **Paso B en diseño aparte.** Enric pidió que los datos de rendimiento tengan su propia sección y sirvan para medir la estrategia. Eso necesita tablas nuevas y una tarea diaria, así que se separa en un paso B con diseño y aprobación.

## Qué verificar manualmente
- Agentes → Integraciones: que Google esté conectado. Si no lo está, el panel de Google no aparece en las fichas.
- Clientes → un cliente con web → Webs y cuentas:
  - «Buscar en Google» propone sus propiedades;
  - «Añadir a la ficha» las guarda con «Tenemos acceso»;
  - «Comprobar accesos» marca el resto.
- «Añadir web o cuenta» → tipo Search Console: aparece el desplegable «Elegir de Google…».
- Por Telegram: «¿cómo va [cliente] en Search Console?» debe responder sin preguntar la propiedad. Con un cliente sin propiedad, debe decir que falta asignarla. Con «¿cuántas llamadas ha tenido [cliente] desde Google Maps?», si Google no ha aprobado la API de Business Profile, llega el error de Google.

## Pendientes detectados
- **Paso B:** sección «Rendimiento», con el histórico diario de Search Console, Analytics y Business Profile por cliente y métricas de la estrategia. El diseño viene a continuación.
- No se ha podido comprobar desde aquí si Google ha aprobado el acceso a la API de Business Profile para el proyecto.
- `app/(dashboard)/dashboard/clientes/[id]/page.tsx` importa `isConnected` de Agentes (núcleo → módulo). Convendría sustituirlo por el registro.
- `ga4PropertyList` hace una petición por propiedad (hasta 60), con caché de 5 minutos. Si la cuenta tiene muchas más propiedades, habría que paginar.
- Pruebas: todas correctas (agentes y seguridad, 64); las 9 de `http` y `auditoria` fallan por diseño en el contenedor temporal. La compilación de producción pasa.
