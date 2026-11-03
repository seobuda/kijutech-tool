import type { NextConfig } from 'next';

// Next.js 16: `experimental.ppr` y `clientSegmentCache` ya no existen
// (PPR pasó a Cache Components, que no usamos). Se retiran sin sustituto.
const nextConfig: NextConfig = {};

export default nextConfig;
