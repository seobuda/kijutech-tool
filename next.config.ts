import type { NextConfig } from 'next';

// Cabeceras de seguridad básicas para todas las rutas.
// - No se fija script-src: Next.js usa scripts en línea y una CSP con nonce exige un montaje
//   aparte (proxy.ts); aquí solo van las directivas que no rompen nada.
// - HSTS solo tiene efecto sobre HTTPS (en 127.0.0.1 por HTTP el navegador lo ignora).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  }
];

// Next.js 16: `experimental.ppr` y `clientSegmentCache` ya no existen
// (PPR pasó a Cache Components, que no usamos). Se retiran sin sustituto.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // El registro público y los precios ya no existen: cualquier enlace viejo va al inicio de sesión.
  async redirects() {
    return [
      { source: '/sign-up', destination: '/sign-in', permanent: false },
      { source: '/pricing', destination: '/sign-in', permanent: false }
    ];
  }
};

export default nextConfig;
