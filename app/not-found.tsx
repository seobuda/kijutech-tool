import Link from 'next/link';
import { CircleIcon } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <div className="max-w-md space-y-8 p-4 text-center">
        <div className="flex justify-center">
          <CircleIcon className="size-12 text-brand" />
        </div>
        <h1 className="text-4xl font-bold text-foreground tracking-tight">
          Página no encontrada
        </h1>
        <p className="text-base text-muted-foreground">
          La página que buscas no existe o ha cambiado de sitio.
        </p>
        <Link
          href="/"
          className="max-w-48 mx-auto flex justify-center py-2 px-4 border border-input rounded-full shadow-sm text-sm font-medium text-foreground/80 bg-card hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
