import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getSafeUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';

export const metadata: Metadata = {
  title: { default: 'Kijutech', template: '%s · Kijutech' },
  description: 'Herramienta interna de Kijutech'
};

export const viewport: Viewport = {
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafb' },
    { media: '(prefers-color-scheme: dark)', color: '#16171c' }
  ]
};

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

// Aplica el tema antes de pintar (sin parpadeo): «light», «dark» o el del sistema.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh] bg-background text-foreground">
        <SWRConfig
          value={{
            fallback: {
              // Sin await: solo los componentes que leen este dato esperan.
              '/api/user': getSafeUser()
            }
          }}
        >
          {children}
        </SWRConfig>
      </body>
    </html>
  );
}
