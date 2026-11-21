'use client';

import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGuide } from '@/components/guia/guide';

export function GuideButton() {
  const { start } = useGuide();
  return (
    <Button size="sm" className="bg-brand text-white hover:bg-brand/90" onClick={() => start()}>
      <Compass aria-hidden /> Ver la guía de la herramienta
    </Button>
  );
}
