# Pantallas tras desplegar: pruebas con cada rol y errores por cuenta de la sesión
**Fecha:** 2026-11-22  
**Rama:** feature/verificar-pantallas  
**Commit:** bbeaa662

Bloque 2 del plan de verificación (hueco H1 de `docs/Arquitectura ingeniera SpaceX.md`). Enric aprobó las dos decisiones
que lo frenaban: crear los usuarios admin, editor y lector en la cuenta de pruebas (nunca super_admin) y arreglar de raíz
cómo se anotan los errores, aunque toque el núcleo (`lib/core/errors.ts`).

## Qué se construyó
- `lib/operaciones/sim/env.ts`: `ensureSimUsers()` crea, solo en una cuenta de pruebas, tres usuarios
  (`pruebas-<rol>@<cuenta>.pruebas.invalid`), cada uno con exactamente su rol. La contraseña es aleatoria y se descarta
  al crearla. También quita cualquier super_admin de esa cuenta.
- `lib/operaciones/sim/scenarios-pantallas.ts` (nuevo):
  - tres escenarios, `pantallas-admin`, `pantallas-editor` y `pantallas-lector`;
  - firman una sesión del usuario de su rol (misma clave y huella que el inicio de sesión) y abren por 127.0.0.1 todas
    las pantallas fijas del panel;
  - fallan si alguna da 5xx, rechaza la sesión, muestra la página de error, deja un trozo roto, o si el servidor anota un
    fallo de página en la cuenta de pruebas;
  - los avisos que el código ya captura («ClickUp no responde») se listan sin hacer fallar.
- `lib/operaciones/sim/pantallas-rules.ts` (nuevo, puro): la lista de pantallas sale del manifiesto de `next build`. Aquí
  están las reglas que deciden fallo, sin acceso u ok.
- `lib/operaciones/sim/kit.ts` y `runner.ts`: `timeoutMs` por escenario (las de pantallas tienen 170 s) y `needsServer`
  (corren en «todas» y tras desplegar, no en `pnpm test`).
- `lib/core/errors.ts` (núcleo):
  - un fallo de una petición web se anota en la cuenta de la sesión. En `onRequestError` se saca de la cookie de la
    cabecera; en `console.error`, del almacén de peticiones de Next, leído sin esperar;
  - la cuenta dueña sigue como «sistema», como antes;
  - la línea «⨯» que Next escribe por cada fallo de petición ya no se anota aparte.
- `instrumentation.ts`: pasa también las cabeceras a `reportRequestError`.
- `app/error.tsx`: marca `data-pagina-error` para que las pruebas reconozcan la página de error.
- `scripts/run-scenarios.sh`: `http.request` con un límite de 15 min en lugar de `fetch`, que cortaba a los 300 s y habría
  provocado una vuelta atrás falsa.
- `tests/pantallas.test.ts` (nuevo, 11 pruebas):
  - reglas de las pantallas y lectura de la cookie;
  - barrera de que el almacén interno de Next sigue existiendo;
  - usuarios (tres, idempotente, sin super_admin, se niega fuera de una cuenta de pruebas);
  - una sesión de la cuenta de pruebas da esa cuenta.
- `tests/pruebas-simuladas.test.ts`: corre los escenarios sin servidor y comprueba que los de pantallas entran en «todas».
- Mapa Visual: paso nuevo «Pantallas con cada rol» (`ops-sim-pantallas`), notas en el entorno de pruebas, en el despliegue
  y en la captura de errores (`lib/core/errors-process-map.ts`). `check-architecture-map.js` pasa (114 pasos en 16 mapas).
- `docs/ESTADO.md` (§6.27, §13, §16, §18, §19, §22) y `CLAUDE.md` (verificación tras cada despliegue).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Sesión firmada por el servidor en vez de iniciar sesión con contraseña:** no hay contraseña que guardar ni filtrar, y
  los usuarios no pueden usarse desde el formulario.
- **Lista de pantallas desde el manifiesto de `next build`:** una pantalla nueva entra sola y no hay una lista que
  mantener. Quedan fuera las pantallas con `[id]` y las 5 de solo super_admin.
- **Cuenta de la sesión también para `console.error`:** el código captura muchos fallos con `console.error` (por ejemplo,
  «ClickUp no responde», que en la cuenta de pruebas pasa siempre). Si solo se arreglaba `onRequestError`, esos avisos
  habrían seguido yendo a la cuenta real. Se lee el almacén interno de Next. Si una versión futura lo cambia, se vuelve al
  comportamiento anterior y una prueba falla.
- **La cuenta dueña sigue como «sistema»:** anotarla con su id habría duplicado los grupos existentes y vuelto a avisar
  de errores ya ignorados.
- **Sin duplicado de la línea «⨯»:** se vio en la verificación que cada pantalla rota creaba dos errores (`web` y
  `sistema`) y dos avisos. Pasaba también en la cuenta real. Se ignora el `console.error` cuyo error lleva `digest`,
  porque ese ya llega con su ruta por `onRequestError`.
- **Puerto fijo 3000:** la barrera de variables de entorno cazó `PORT` (producción no lo declara). Se usa el mismo puerto
  que `run-scenarios.sh`.
- **Verificación con pantallas trampa temporales** (una que revienta y otra que solo escribe en la consola), en una
  imagen local, borradas después:
  - las tres pruebas detectan la rota;
  - sus errores quedan en `kijutech-pruebas` y sus avisos en el Telegram simulado;
  - con una sesión válida de la cuenta real, los mismos errores siguen como «sistema»;
  - tras el arreglo, sin duplicado.
  - Se borraron de la base local los grupos de error que crearon las trampas.

## Qué verificar manualmente
- Sistema → Pruebas: aparecen las tres «Pantallas con rol …» con la última ejecución «tras desplegar» en verde, y su
  detalle dice cuántas pantallas abre cada rol.
- Errores: tras el despliegue no debe haber errores nuevos de la cuenta de pruebas en la lista de la cuenta real ni
  avisos en el chat de Sistema por ellos.
- `docker exec kijutech_app pnpm test` tras reconstruir: 509 pruebas correctas y 1 saltada.

## Pendientes detectados
- Las 5 pantallas de solo super_admin y las de `[id]` no se recorren (hasta S2/S3 y hasta que la cuenta de pruebas tenga
  datos de ejemplo).
- Servidor y costes (y quizá Gasto de IA) usan el token del entorno si la cuenta no tiene uno propio. El admin de
  cualquier cuenta vería datos de la plataforma. Es la misma familia que S2/S3 (ESTADO §16).
- Bloque Seguridad del Mapa Visual (`lib/auth/security-process-map.ts`, necesita OK): añadir los usuarios de pruebas y la
  verificación de pantallas.
