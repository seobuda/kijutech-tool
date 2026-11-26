// Texto con formato sencillo (el de las descripciones de encargos): párrafos, listas con «- », **negrita** y _cursiva_.
// Sin HTML: cada trozo se pinta como texto, así que no hay forma de inyectar nada.
import * as React from 'react';
import { cn } from '@/lib/utils';

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|_([^_]+)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <strong key={k++} className="font-medium text-foreground">{m[1]}</strong> : <em key={k++}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>);
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-0.5 pl-5">
          {list.map((l, i) => (
            <li key={i} className="break-words">
              {inline(l)}
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (!l.trim()) {
      flush();
      continue;
    }
    if (/^\s*[-•]\s+/.test(l)) {
      if (para.length) {
        const p = para;
        para = [];
        blocks.push(<p key={blocks.length}>{inline(p.join(' '))}</p>);
      }
      list.push(l.replace(/^\s*[-•]\s+/, ''));
    } else {
      if (list.length) flush();
      para.push(l.trim());
    }
  }
  flush();
  return <div className={cn('space-y-2 text-sm', className)}>{blocks}</div>;
}
