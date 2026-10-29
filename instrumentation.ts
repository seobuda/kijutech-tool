// Next.js ejecuta register() una vez al arrancar el servidor. Aquí se lanzan los
// procesos de fondo de Telegram (escucha del bot y planificador de avisos) dentro del
// propio contenedor de la aplicación, sin servicios adicionales.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startTelegramWorkers } = await import('./lib/operaciones/telegram-worker');
    startTelegramWorkers();
  }
}
