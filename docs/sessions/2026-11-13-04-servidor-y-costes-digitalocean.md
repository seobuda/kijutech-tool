# Servidor y costes de DigitalOcean
**Fecha:** 2026-11-13  
**Rama:** feature/coste-servidor  
**Commit:** 6ba82bd4

## Qué se construyó
- **Despliegue previo:** `feature/reasignar-y-vigia-ia` fusionada en `main` (`132ad035`) y desplegada con `--migrate`. Migración 0046 aplicada, 47 migraciones, web 200, Telegram sin errores y 0 errores en logs.
- `lib/operaciones/infra-watch.ts` (nuevo, sin IA):
  - lee la API de DigitalOcean: saldo del mes, facturas, servidores, snapshots, tamaños y monitorización del servidor de la herramienta (memoria, disco, carga);
  - caché de 1 h en `ops_settings` (`do_cache`);
  - estimación del coste fijo, previsión, propuesta de ampliación (`nextSize`) y recomendaciones;
  - aviso semanal de presupuesto (`runInfraWatch`).
- `lib/operaciones/infra-actions.ts` (nuevo, admin): conectar el token (probándolo antes), quitarlo y refrescar. El token se guarda cifrado.
- `app/(dashboard)/dashboard/operaciones/servidor/` (nuevo, Sistema → Servidor y costes):
  - cifras;
  - medidores de memoria, CPU y disco;
  - recomendaciones con el cambio de precio;
  - servidores de la cuenta, snapshots y facturas;
  - conexión del token.
- `health.ts`: comprobaciones «Memoria del servidor» y «CPU del servidor», leídas de la caché sin llamadas extra.
- `automations.ts`: tarjeta `infra` (presupuesto 45 $, memoria alta al 85 %, aviso).
- `reports.ts`: línea de DigitalOcean en el informe semanal.
- `telegram-worker.ts`: paso «servidor y costes».
- `nav.ts`: pestaña.
- Mapa Visual: paso «Servidor y costes de DigitalOcean». **La comprobación pasó** (20 automatizaciones, 16 tareas del planificador, 7 prompts, 40 tablas, 104 pasos, 16 mapas).
- Documentación: `docs/ESTADO.md` (§6.20, §7 y mapa de archivos) y `docs/PENDIENTES-ENRIC.md`.
- Pruebas:
  - `tests/servidor.test.ts` (nuevo);
  - `tests/seguridad.test.ts`: 3 acciones de administración nuevas.
  - Resultado: tipos limpios; 243 pruebas OK y las 9 de entorno de siempre.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Se vigilan coste y capacidad.** En DigitalOcean el servidor tiene precio fijo: más procesos no suben la factura, pero el riesgo es quedarse sin memoria, CPU o disco y tener que ampliar.
- **Previsión con el coste fijo actual**, no con el ritmo lineal del mes. Con datos reales, el ritmo lineal daba 31,25 $ porque kijutech-brain se creó el día 4; con el coste fijo da ~34,5 $.
- **La propuesta de ampliación usa el precio real** de la API de tamaños: el tamaño más barato con el doble de memoria.
- **Salud no llama a DigitalOcean:** lee la caché de la última hora y, si tiene más de 3 h, no comprueba nada.
- **Token de solo lectura recomendado.** El del `.env` funciona, pero no sé qué permisos tiene.
- **Probado con la cuenta real**, solo lectura:
  - 13,54 $ en lo que va de mes;
  - coste fijo de 36,95 $/mes (31 $ servidores, 4,80 $ copias, 1,15 $ snapshots);
  - kijutech-brain al 34 % de memoria (pico del 83 %), 28 % de disco y CPU al 39 % en los momentos altos.

## Qué verificar manualmente
- Desplegar (sin migración).
- Crear en DigitalOcean un token de solo lectura y conectarlo en Sistema → Servidor y costes.
- Revisar el presupuesto en Automatizaciones → Servidor y costes.

## Pendientes detectados
- **El saldo de DigitalOcean se actualiza con retraso** (`generated_at` de varias horas). La previsión lo compensa con el coste fijo.
- **Solo se vigila la capacidad del servidor de la herramienta** (`OPS_APP_DROPLET`, por defecto `kijutech-brain`).
- **Snapshots de más de 6 meses:** 19 GB, de otros proyectos. Solo se informa, no se toca nada.
