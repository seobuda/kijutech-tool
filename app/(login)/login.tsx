'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowRight, Bot, CalendarCheck, Loader2, Workflow } from 'lucide-react';
import { signIn } from './actions';
import { ActionState } from '@/lib/auth/middleware';

// Solo cambia la presentación: el formulario, sus campos y la acción signIn son los de siempre.
const HIGHLIGHTS = [
  { icon: Bot, title: 'Un agente que coordina', text: 'Convierte notas en encargos, avisa al equipo y resuelve bloqueos.' },
  { icon: CalendarCheck, title: 'El equipo al día', text: 'Qué tiene cada persona hoy, qué vence y qué espera tu decisión.' },
  { icon: Workflow, title: 'Todo conectado', text: 'ClickUp, Telegram y la IA trabajando sobre los mismos datos.' }
];

export function Login() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signIn, { error: '' });

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca (escritorio) */}
      <aside className="relative hidden overflow-hidden bg-[oklch(0.2_0.02_265)] p-12 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute -left-32 -top-32 size-[520px] rounded-full bg-brand/40 blur-[120px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 right-0 size-[420px] rounded-full bg-[oklch(0.55_0.2_300)]/30 blur-[120px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px]"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-[oklch(0.6_0.2_25)] text-lg font-bold shadow-lg">
            K
          </span>
          <span className="text-lg font-semibold tracking-tight">Kijutech</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance">
            El centro de operaciones de la agencia.
          </h1>
          <p className="mt-4 text-base text-white/70 text-pretty">
            Proyectos, equipo y clientes en un único lugar, con un agente que hace el seguimiento por ti.
          </p>
          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 backdrop-blur">
                  <h.icon className="size-5 text-[oklch(0.82_0.12_55)]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{h.title}</span>
                  <span className="block text-sm text-white/60">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">Herramienta interna de Kijutech</p>
      </aside>

      {/* Formulario */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-[oklch(0.6_0.2_25)] text-lg font-bold text-white shadow-md">
              K
            </span>
            <span className="text-lg font-semibold tracking-tight">Kijutech</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Inicia sesión</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Entra con tu correo de la agencia para continuar.</p>

          <form className="mt-8 space-y-5" action={formAction}>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={255}
                className="h-11 rounded-lg bg-card"
                placeholder="tu@correo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={100}
                className="h-11 rounded-lg bg-card"
                placeholder="Tu contraseña"
              />
            </div>

            {state?.error && (
              <div
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {state.error}
              </div>
            )}

            <Button
              type="submit"
              className="h-11 w-full rounded-lg bg-brand text-white shadow-sm hover:bg-brand/90"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  Iniciar sesión
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            ¿No tienes cuenta? Las cuentas las crea el administrador.
          </p>
        </div>
      </main>
    </div>
  );
}
