// Foto o avatar de un miembro del equipo: su foto si la tiene; si no, iniciales sobre un color estable (personas) o un
// icono de robot (agentes). Los agentes llevan siempre una pequeña marca «IA» para distinguirlos de un vistazo.
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const HUES = [
  'bg-[oklch(0.9_0.06_25)] text-[oklch(0.4_0.12_25)]',
  'bg-[oklch(0.9_0.06_60)] text-[oklch(0.42_0.1_60)]',
  'bg-[oklch(0.92_0.07_100)] text-[oklch(0.42_0.09_100)]',
  'bg-[oklch(0.9_0.06_150)] text-[oklch(0.4_0.1_150)]',
  'bg-[oklch(0.9_0.05_200)] text-[oklch(0.4_0.09_200)]',
  'bg-[oklch(0.9_0.05_250)] text-[oklch(0.42_0.11_250)]',
  'bg-[oklch(0.9_0.06_300)] text-[oklch(0.42_0.12_300)]',
  'bg-[oklch(0.9_0.05_340)] text-[oklch(0.42_0.12_340)]'
];

export function MemberAvatar({
  name,
  kind,
  avatarUrl,
  initials,
  hue,
  size = 'md',
  className
}: {
  name: string;
  kind: 'persona' | 'agente';
  avatarUrl: string | null;
  initials: string;
  hue: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-20 text-2xl' }[size];
  const icon = { sm: 'size-4', md: 'size-5', lg: 'size-9' }[size];
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /api/equipo/avatar
        <img src={avatarUrl} alt={name} className={cn(box, 'rounded-full object-cover ring-1 ring-border')} />
      ) : kind === 'agente' ? (
        <span className={cn(box, 'grid place-items-center rounded-full bg-brand-soft text-brand ring-1 ring-border')} role="img" aria-label={name}>
          <Bot className={icon} aria-hidden />
        </span>
      ) : (
        <span className={cn(box, 'grid place-items-center rounded-full font-semibold ring-1 ring-border', HUES[hue % HUES.length])} role="img" aria-label={name}>
          {initials}
        </span>
      )}
      {kind === 'agente' && (
        <span className="absolute -bottom-0.5 -right-1 rounded-full border bg-card px-1 text-[9px] font-semibold leading-tight text-brand shadow-xs" aria-hidden>
          IA
        </span>
      )}
    </span>
  );
}
