'use client';

// Cambiar o quitar la foto de un miembro del equipo. La imagen se recorta en cuadrado y se reduce a 256 px en el
// navegador (WebP) antes de enviarla: unos 15 KB, nunca la foto original del móvil.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { removeAvatar, setAvatar } from '@/lib/equipo/actions';

const SIZE = 256;

async function toSquareWebp(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no puede preparar la imagen.');
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  const webp = canvas.toDataURL('image/webp', 0.85);
  // Safari antiguo no sabe hacer WebP y devuelve PNG: también vale.
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

export function AvatarEditor({ kind, id, hasPhoto }: { kind: 'persona' | 'agente'; id: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setMsg({ ok: false, text: 'Elige una imagen (JPG, PNG o WebP).' });
    start(async () => {
      try {
        const res = await setAvatar(kind, id, await toSquareWebp(file));
        setMsg({ ok: res.ok, text: res.message });
        if (res.ok) router.refresh();
      } catch (err) {
        setMsg({ ok: false, text: err instanceof Error ? err.message : 'No se pudo preparar la imagen.' });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={onFile} aria-label="Elegir foto" />
      <Button size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
        <Camera aria-hidden />
        {pending ? 'Guardando…' : hasPhoto ? 'Cambiar foto' : 'Subir foto'}
      </Button>
      {hasPhoto && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await removeAvatar(kind, id);
              setMsg({ ok: res.ok, text: res.message });
              if (res.ok) router.refresh();
            })
          }
        >
          <Trash2 aria-hidden />
          Quitar
        </Button>
      )}
      {msg && (
        <span role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
