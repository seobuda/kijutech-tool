// SEO · artículo completo redactado con IA (27 nov 2026): lectura de la respuesta y limpieza del HTML (lista blanca).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countWords, parseArticle, sanitizeArticleHtml, slugify } from '@/lib/seo/contenido/article-rules';

const body = Array.from({ length: 40 }, (_, i) => `<p>Párrafo ${i} con varias palabras de prueba para el artículo.</p>`).join('\n');

describe('artículo: lectura de la respuesta', () => {
  it('cabeceras, separador y cuerpo', () => {
    const a = parseArticle(`TÍTULO: Clases de kickboxing en Sabadell: pierde el miedo en tu primera clase\nMETA: Descubre cómo son nuestras clases.\nSLUG: clases-kickboxing-sabadell\n---\n<h2>Por qué</h2>\n${body}`, 'clases de kickboxing')!;
    expect(a.title).toBe('Clases de kickboxing en Sabadell: pierde el miedo en tu primera clase');
    expect(a.meta).toBe('Descubre cómo son nuestras clases.');
    expect(a.slug).toBe('clases-kickboxing-sabadell');
    expect(a.html.startsWith('<h2>Por qué</h2>')).toBe(true);
    expect(a.words).toBeGreaterThan(300);
  });
  it('sin separador o demasiado corto, nada (mejor fallar que medio artículo)', () => {
    expect(parseArticle(`TÍTULO: x\n${body}`, 'x')).toBeNull();
    expect(parseArticle('TÍTULO: x\n---\n<p>corto</p>', 'x')).toBeNull();
  });
  it('sin título usa la búsqueda; slug sin acentos', () => {
    expect(parseArticle(`---\n${body}`, 'depilación láser')!.title).toBe('depilación láser');
    expect(slugify('Depilación Láser en Sabadell: ¿duele?')).toBe('depilacion-laser-en-sabadell-duele');
  });
});

describe('artículo: HTML con lista blanca', () => {
  it('quita scripts, estilos, atributos, enlaces e imágenes; H1 pasa a H2', () => {
    const h = sanitizeArticleHtml('<h1 class="x">Título</h1><p style="color:red" onclick="alert(1)">Hola <a href="javascript:alert(1)">aquí</a></p><script>alert(1)</script><img src=x onerror=alert(1)><style>p{}</style><iframe src="//x"></iframe><ul><li>uno</li></ul>');
    expect(h).toBe('<h2>Título</h2><p>Hola aquí</p><ul><li>uno</li></ul>');
  });
  it('un «<» suelto se escapa', () => {
    expect(sanitizeArticleHtml('<p>precio < 50 €</p>')).toBe('<p>precio &lt; 50 €</p>');
  });
  it('cuenta palabras sin etiquetas', () => {
    expect(countWords('<h2>Hola mundo</h2><p>uno, dos &nbsp; tres</p>')).toBe(5);
  });
});

describe('artículo: el prompt existe y es de Sonnet', () => {
  it('migración del prompt y modelo', () => {
    const sql = readFileSync('lib/db/migrations/0076_seo_redactar_articulo.sql', 'utf8');
    expect(sql).toContain("'seo_redactar_articulo'");
    expect(sql).toMatch(/\[verificar:/);
    expect(readFileSync('lib/seo/contenido/briefs.ts', 'utf8')).toContain("ARTICLE_MODEL = 'claude-sonnet-5-5'");
  });
});
