'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  removeClickUpToken,
  saveClickUpToken,
  saveTranscriptionModel,
  testClickUpConnection,
  type TestConnectionResult
} from '@/lib/operaciones/actions';

export function AjustesClickUp({
  hasToken,
  updatedAt,
  transcriptionModel
}: {
  hasToken: boolean;
  updatedAt: string | null;
  transcriptionModel: string;
}) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [result, setResult] = useState<TestConnectionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      setResult(null);
      const res = await saveClickUpToken(token);
      if (res.ok) {
        setToken('');
        setMessage({ type: 'ok', text: 'Token guardado (cifrado). Ya puedes probar la conexión.' });
        router.refresh();
      } else {
        setMessage({ type: 'error', text: res.error });
      }
    });

  const test = () =>
    startTransition(async () => {
      setMessage(null);
      setResult(await testClickUpConnection());
    });

  const remove = () =>
    startTransition(async () => {
      if (!window.confirm('¿Eliminar el token de ClickUp guardado?')) return;
      await removeClickUpToken();
      setResult(null);
      setMessage({ type: 'ok', text: 'Token eliminado.' });
      router.refresh();
    });

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Token personal de ClickUp</CardTitle>
          <CardDescription>
            En ClickUp: tu avatar → Ajustes → Aplicaciones → «API Token». Se guarda cifrado y nunca
            se vuelve a mostrar.
            {hasToken && updatedAt && (
              <> Hay un token guardado (actualizado el {new Date(updatedAt).toLocaleString('es-ES')}).</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clickup-token">
              {hasToken ? 'Sustituir token' : 'Token'} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="clickup-token"
              type="password"
              autoComplete="off"
              placeholder="pk_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending || !token.trim()}>
              {hasToken ? 'Guardar nuevo token' : 'Guardar token'}
            </Button>
            <Button variant="outline" onClick={test} disabled={pending || !hasToken}>
              {pending ? 'Consultando…' : 'Probar conexión'}
            </Button>
            {hasToken && (
              <Button variant="ghost" onClick={remove} disabled={pending}>
                Eliminar token
              </Button>
            )}
          </div>
          {message && (
            <p className={`text-sm ${message.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
              {message.text}
            </p>
          )}
          {!hasToken && !message && (
            <p className="text-sm text-muted-foreground">
              Aún no hay token. Pégalo arriba y guárdalo para activar «Equipo hoy».
            </p>
          )}
        </CardContent>
      </Card>

      <ModeloTranscripcion initial={transcriptionModel} />

      {result && !result.ok && (
        <p className="text-sm text-red-600">Error de conexión: {result.error}</p>
      )}

      {result?.ok &&
        result.workspaces.map((w) => (
          <Card key={w.id}>
            <CardHeader>
              <CardTitle>✅ Workspace: {w.name}</CardTitle>
              <CardDescription>
                {w.memberCount} miembros · {w.spaces.length} espacios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {w.spaces.length === 0 && (
                <p className="text-sm text-muted-foreground">Este workspace no tiene espacios.</p>
              )}
              {w.spaces.map((s) => (
                <div key={s.id}>
                  <p className="font-medium">
                    {s.name}{' '}
                    <span className="text-xs text-muted-foreground">({s.lists.length} listas)</span>
                  </p>
                  <ul className="mt-1 ml-4 list-disc text-sm text-gray-700 space-y-0.5">
                    {s.lists.map((l) => (
                      <li key={l.id}>
                        {l.folder && <span className="text-muted-foreground">{l.folder} / </span>}
                        {l.name}
                      </li>
                    ))}
                    {s.lists.length === 0 && (
                      <li className="list-none text-muted-foreground">Sin listas</li>
                    )}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

function ModeloTranscripcion({ initial }: { initial: string }) {
  const [model, setModel] = useState(initial);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await saveTranscriptionModel(model);
      setMsg(res.ok ? { type: 'ok', text: 'Modelo guardado.' } : { type: 'error', text: res.error });
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcripción de audio</CardTitle>
        <CardDescription>
          Modelo de Gemini que transcribe las grabaciones del Bloc de notas. Usa la clave de Gemini
          ya configurada en IA &amp; Modelos. Por defecto: gemini-flash-latest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="transcription-model">Modelo</Label>
          <Input
            id="transcription-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-flash-latest"
          />
        </div>
        <Button onClick={save} disabled={pending || !model.trim() || model.trim() === initial}>
          {pending ? 'Guardando…' : 'Guardar modelo'}
        </Button>
        {msg && (
          <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
        )}
      </CardContent>
    </Card>
  );
}
