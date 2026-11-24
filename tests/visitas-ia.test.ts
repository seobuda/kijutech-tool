// Visitas desde asistentes de IA (Hito 2 SEO, 24 nov 2026): lista del núcleo, filas de Analytics y cifra «ga4_ai».
import { describe, expect, it } from 'vitest';
import { AI_SOURCE_REGEX, aiAssistantOf, groupByAssistant } from '@/lib/core/ai-assistants';
import { ga4RowsToMetrics } from '@/lib/agentes/metrics';
import { AI_TOTAL, KPI, buildDayMap, kpiValue, seriesKey } from '@/lib/rendimiento/rules';

describe('asistentes de IA', () => {
  it('reconoce las fuentes de Analytics de cada asistente (y subdominios), y no las demás', () => {
    expect(aiAssistantOf('chatgpt.com')?.key).toBe('chatgpt');
    expect(aiAssistantOf('chat.openai.com')?.key).toBe('chatgpt');
    expect(aiAssistantOf('www.perplexity.ai')?.key).toBe('perplexity');
    expect(aiAssistantOf('gemini.google.com')?.key).toBe('gemini');
    expect(aiAssistantOf('google')).toBeNull();
    expect(aiAssistantOf('notchatgpt.com')).toBeNull();
  });

  it('la expresión para Analytics casa lo mismo', () => {
    const re = new RegExp(AI_SOURCE_REGEX, 'i');
    expect(re.test('chatgpt.com')).toBe(true);
    expect(re.test('www.perplexity.ai')).toBe(true);
    expect(re.test('claude.ai')).toBe(true);
    expect(re.test('google')).toBe(false);
    expect(re.test('notchatgpt.com')).toBe(false);
    expect(re.test('chatgpt.com.evil.es')).toBe(false);
  });

  it('suma las fuentes del mismo asistente', () => {
    expect(groupByAssistant([{ key: 'chatgpt.com', value: 5 }, { key: 'chat.openai.com', value: 2 }, { key: 'perplexity.ai', value: 3 }])).toEqual([
      { key: 'chatgpt', label: 'ChatGPT', value: 7 },
      { key: 'perplexity', label: 'Perplexity', value: 3 }
    ]);
  });

  it('las filas de Analytics por fuente se guardan con dim_type «source» y suman en la cifra ga4_ai', () => {
    const rows = ga4RowsToMetrics(
      {
        rows: [
          { dimensionValues: [{ value: '20261120' }, { value: 'chatgpt.com' }], metricValues: [{ value: '4' }, { value: '1' }] },
          { dimensionValues: [{ value: '20261120' }, { value: 'perplexity.ai' }], metricValues: [{ value: '2' }, { value: '0' }] }
        ]
      },
      ['sessions', 'keyEvents'],
      'source'
    );
    expect(rows.find((r) => r.metric === 'sessions' && r.dimValue === 'chatgpt.com')).toMatchObject({ date: '2026-11-20', dimType: 'source', value: 4 });
    const dm = buildDayMap(rows.map((r) => ({ source: 'ga4', date: r.date, metric: r.metric, dimType: r.dimType ?? '', dimValue: r.dimValue ?? '', value: r.value })));
    expect(dm.get('2026-11-20')?.get(seriesKey('ga4', 'sessions', 'source', AI_TOTAL))).toBe(6);
    expect(kpiValue(KPI.ga4_ai, dm, '2026-11-14', '2026-11-20')).toBe(6);
  });
});
