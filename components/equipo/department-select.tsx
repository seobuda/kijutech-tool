'use client';

// Departamento de una persona (solo administración): se guarda al elegirlo.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPersonDepartment } from '@/lib/equipo/actions';

export function DepartmentSelect({ profileId, value, options }: { profileId: string; value: string | null; options: { key: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="dept" className="text-sm text-muted-foreground">
        Departamento
      </label>
      <select
        id="dept"
        defaultValue={value ?? ''}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value || null;
          start(async () => {
            const res = await setPersonDepartment(profileId, v);
            setMsg({ ok: res.ok, text: res.message });
            if (res.ok) router.refresh();
          });
        }}
        className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        <option value="">Sin departamento</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name}
          </option>
        ))}
      </select>
      {msg && (
        <span role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
