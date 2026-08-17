'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check } from 'lucide-react';
import { updateSeoSetting } from '@/lib/seo/admin-actions';

type Props = {
  settingKey: string;
  initialValue: string;
};

export function SettingRow({ settingKey, initialValue }: Props) {
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await updateSeoSetting(settingKey, value);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar');
      }
    });
  }

  return (
    <div>
      <div className="flex items-center space-x-2">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="max-w-lg"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            'Guardar'
          )}
        </Button>
      </div>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      {saved && !error && (
        <p className="text-green-500 text-sm mt-1">Guardado.</p>
      )}
    </div>
  );
}
