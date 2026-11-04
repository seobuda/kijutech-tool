'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@/lib/auth/middleware';
import { createUserAction } from './actions';

const ROLES = [
  { value: 'lector', label: 'Lector (solo ver)' },
  { value: 'editor', label: 'Editor (Bloc, encargos, fichas, SEO)' },
  { value: 'admin', label: 'Admin (además: tokens, automatizaciones, borrar)' },
  { value: 'super_admin', label: 'Super admin (además: usuarios)' }
];

export function CrearUsuarioForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createUserAction, {});

  return (
    <form action={formAction} className="space-y-4 max-w-md">
      <div className="space-y-1">
        <Label htmlFor="name">
          Nombre <span className="text-red-500">*</span>
        </Label>
        <Input id="name" name="name" required maxLength={100} defaultValue={state.name} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">
          Correo <span className="text-red-500">*</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          maxLength={255}
          defaultValue={state.email}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">
          Contraseña inicial <span className="text-red-500">*</span>
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={100}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Mínimo 12 caracteres. Pásasela a la persona por un canal seguro.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="role">
          Rol <span className="text-red-500">*</span>
        </Label>
        <select
          id="role"
          name="role"
          defaultValue="lector"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {state.error && (
        <p className="text-sm text-red-500" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-green-600" role="status">
          {state.success}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="animate-spin mr-2 h-4 w-4" />
            Creando…
          </>
        ) : (
          'Crear usuario'
        )}
      </Button>
    </form>
  );
}
