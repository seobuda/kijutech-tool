import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

/**
 * Mapa Visual — bloque «Seguridad» (nivel 2). Cada paso es una capa de defensa real del código.
 * Regla de CLAUDE.md: al añadir, quitar o cambiar una capa de seguridad, se actualiza aquí.
 */
export const SECURITY_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'login',
    name: 'Inicio de sesión',
    description:
      'Solo entran usuarios dados de alta por un super admin. Mensaje de error idéntico exista o no el correo, y la contraseña nunca se devuelve a la pantalla.',
    status: 'built',
    file: 'app/(login)/actions.ts',
    technicalDetail: {
      summary:
        'signIn comprueba primero el bloqueo, luego compara la contraseña con bcrypt (también con un hash de relleno si el correo no existe, para que no se note por el tiempo) y crea una cookie de sesión httpOnly firmada con AUTH_SECRET.',
      stack: ['bcryptjs', 'JWT HS256 con jose', 'Cookie httpOnly, secure, sameSite=lax'],
      keyDecisions: [
        'No hay registro público: /sign-up no existe y redirige al inicio de sesión',
        'Los usuarios los crea un super_admin en /dashboard/usuarios (contraseña de 12+ caracteres y rol obligatorio)',
      ],
    },
  },
  {
    id: 'rate-limit',
    name: 'Límite de intentos',
    description: '5 fallos en 15 minutos bloquean ese correo temporalmente, aunque se acierte la contraseña después.',
    status: 'built',
    file: 'lib/auth/rate-limit.ts',
    tables: ['auth_login_attempts'],
    technicalDetail: {
      summary:
        'Cada intento queda en auth_login_attempts (correo, IP, resultado). Se cuenta por correo, no solo por IP, para que cambiar de IP no sirva para seguir probando. Un inicio de sesión correcto borra los fallos pendientes.',
      keyDecisions: ['En base de datos y no en memoria: sobrevive a un reinicio del contenedor'],
    },
  },
  {
    id: 'roles',
    name: 'Permisos por rol',
    description:
      'Quién puede hacer qué (lector, editor, admin, super_admin), comprobado en el servidor en cada acción y ruta de API; ocultar un botón no cuenta.',
    status: 'built',
    file: 'lib/auth/permissions.ts',
    technicalDetail: {
      summary:
        'Cuatro niveles (ver, editar, administrar, usuarios). Cada acción del servidor llama a su guard antes de hacer nada; una auditoría automática falla si alguna función exportada no lo hace. Mi bandeja es solo del dueño y un usuario sin rol no puede ni ver.',
      keyDecisions: [
        'Las funciones internas de SEO (ensure*, upsert*, assert*) viven en lib/seo/access.ts con server-only: no son endpoints',
        'Mismo mensaje para «no existe» y «es de otra cuenta»: no revela qué ids hay',
      ],
    },
  },
  {
    id: 'secrets',
    name: 'Secretos y claves',
    description:
      'Ningún secreto en archivos versionados ni en la imagen de Docker. Los tokens solo se ven enmascarados; las claves guardadas se cifran con AES-256-GCM.',
    status: 'built',
    file: 'docker-compose.yml',
    technicalDetail: {
      summary:
        'Los secretos se leen de .env (ignorado por Git y por Docker). scripts/rotate-encryption-key.js vuelve a cifrar las claves guardadas (IA, ClickUp, Telegram) con una clave nueva, en una transacción y con prueba en seco; se ejecutará al migrar a producción.',
      keyDecisions: [
        'El puerto de PostgreSQL solo escucha en 127.0.0.1',
        'En producción AUTH_SECRET, AI_ENCRYPTION_KEY y la contraseña de la base de datos son nuevos',
      ],
    },
  },
  {
    id: 'public-links',
    name: 'Enlaces públicos',
    description: 'El enlace /share de cada proyecto se puede desactivar o regenerar con un botón.',
    status: 'built',
    file: 'lib/seo/kw-actions.ts',
    technicalDetail: {
      summary:
        'Desactivar borra el token (la URL deja de funcionar al instante); regenerar invalida el anterior y crea uno nuevo. Ambas exigen rol de editor o superior.',
    },
  },
  {
    id: 'errors-headers',
    name: 'Errores y cabeceras',
    description:
      'El usuario ve mensajes genéricos; el detalle técnico queda solo en los logs. Cabeceras de seguridad en todas las respuestas.',
    status: 'built',
    file: 'next.config.ts',
    technicalDetail: {
      summary:
        'publicError() sustituye los errores de base de datos, red o trazas por un mensaje genérico y deja el original en docker logs. Cabeceras: X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS y una CSP básica sin script-src.',
      keyDecisions: ['No se fija script-src: Next.js usa scripts en línea y una CSP con nonce se montará aparte'],
    },
  },
  {
    id: 'tests',
    name: 'Pruebas de seguridad',
    description:
      'pnpm test comprueba aislamiento entre cuentas, permisos por rol, acceso sin sesión, bloqueo de intentos, /api/user sin hash y ausencia de secretos.',
    status: 'built',
    file: 'tests/seguridad.test.ts',
    technicalDetail: {
      summary:
        'Vitest dentro del contenedor, con cookies de sesión reales (no se simula la autenticación) y usuarios de prueba por rol que se borran al terminar. Incluye auditorías estáticas que fallan si una acción nueva no tiene guard.',
      stack: ['Vitest', 'docker exec kijutech_app pnpm test'],
    },
  },
];
