// Next.js ejecuta register() una vez al arrancar el servidor. Aquí se lanzan los
// procesos de fondo de Telegram (escucha del bot y planificador de avisos) dentro del
// propio contenedor de la aplicación, sin servicios adicionales.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Registro central de errores (17 nov 2026): lo que se escribe con console.error/console.warn y las promesas
    // rechazadas sin capturar quedan también en la base (sys_error_*), no solo en `docker logs`.
    const { captureConsole, reportError } = await import('./lib/core/errors');
    captureConsole();
    process.on('unhandledRejection', (reason) => reportError({ error: reason, source: 'sistema', area: 'promesa rechazada sin capturar' }));
    process.on('uncaughtExceptionMonitor', (err) => reportError({ error: err, source: 'sistema', area: 'excepción sin capturar', severity: 'critico' }));
    // Conecta los módulos con el núcleo (herramientas de los agentes, canales) antes de arrancar los procesos de fondo.
    const { wireApp } = await import('./lib/app-wiring');
    wireApp();
    // Cimientos (23 nov 2026): APP_ROLE=web solo atiende la web y el bot; APP_ROLE=worker solo corre la cola de
    // trabajos (contenedor aparte en producción); sin APP_ROLE (local, un solo contenedor) hace las dos cosas.
    const role = process.env.APP_ROLE ?? '';
    if (role !== 'worker') {
      const { startTelegramWorkers } = await import('./lib/operaciones/telegram-worker');
      startTelegramWorkers();
    }
    if (role !== 'web') {
      const { startWorker } = await import('./lib/core/jobs');
      startWorker();
    }
  }
}

// Errores de las peticiones (páginas, acciones del servidor, rutas de API): al registro central con su ruta.
export async function onRequestError(err: unknown, request: { path?: string; method?: string; headers?: Record<string, string | string[] | undefined> }, context: { routerKind?: string; routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportRequestError } = await import('./lib/core/errors');
  reportRequestError(err, request, context);
}
