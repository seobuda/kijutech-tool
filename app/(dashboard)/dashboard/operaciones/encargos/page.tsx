import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { opsRequests } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { RetryButton } from './retry-button';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; className: string }> = {
  creado: { label: 'Creado', className: 'bg-green-100 text-green-700' },
  pendiente_clickup: { label: 'Pendiente de ClickUp', className: 'bg-amber-100 text-amber-700' },
  error_sync: { label: 'Error de sincronización', className: 'bg-red-100 text-red-700' }
};

const PRIORITY: Record<number, string> = { 1: 'Urgente', 2: 'Alta', 3: 'Normal', 4: 'Baja' };

const fmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

export default async function EncargosPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const rows = await db
    .select()
    .from(opsRequests)
    .where(eq(opsRequests.tenantId, user.tenantId))
    .orderBy(desc(opsRequests.createdAt))
    .limit(200);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-3">
        <p className="font-medium">Todavía no hay encargos</p>
        <p className="text-sm text-muted-foreground">
          Crea el primero y aparecerá aquí con su estado y el enlace a ClickUp.
        </p>
        <Link
          href="/dashboard/operaciones/nuevo"
          className="inline-block rounded-full bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600"
        >
          Nuevo encargo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/dashboard/operaciones/nuevo"
          className="rounded-full bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600"
        >
          Nuevo encargo
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Creado</th>
              <th className="px-3 py-2">Encargo</th>
              <th className="px-3 py-2">Lista</th>
              <th className="px-3 py-2">Responsable</th>
              <th className="px-3 py-2">Entrega</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">ClickUp</th>
              <th className="px-3 py-2">Visto (Telegram)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const st = STATUS[r.status] ?? { label: r.status, className: 'bg-gray-100 text-gray-600' };
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmt.format(r.createdAt)}</td>
                  <td className="px-3 py-2 min-w-[16rem]">
                    <p className="font-medium">{r.title}</p>
                    {r.priority && (
                      <p className="text-xs text-muted-foreground">Prioridad {PRIORITY[r.priority]}</p>
                    )}
                    {r.errorMessage && r.status !== 'creado' && (
                      <p className="mt-1 text-xs text-red-600">{r.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.clickupListName ?? r.clickupListId}</td>
                  <td className="px-3 py-2">{r.assigneeName ?? <span className="text-gray-400">Sin asignar</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.dueDate ? new Date(r.dueDate + 'T00:00:00').toLocaleDateString('es-ES') : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${st.className}`}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.clickupTaskUrl ? (
                      <a
                        href={r.clickupTaskUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-600 hover:underline"
                      >
                        Abrir tarea
                      </a>
                    ) : (
                      <RetryButton requestId={r.id} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.seenAt ? (
                      <span title={r.seenBy ?? ''}>
                        <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">✅ Visto</span>{' '}
                        <span className="text-muted-foreground">{fmt.format(r.seenAt)}</span>
                        {r.seenBy && <span className="block text-muted-foreground">{r.seenBy}</span>}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
