-- ============================================================
-- KNOWLEDGE CARDS — Keyword Research (módulo SEO Kijutech)
-- Ejecutar dentro del contenedor:
--   docker exec -i kijutech_db psql -U kijutech -d kijutech_db < seed-knowledge-cards-keyword-research.sql
-- Idempotente: borra las cards existentes de keyword_research y las reinserta limpias
-- ============================================================

BEGIN;

DELETE FROM seo_knowledge_cards WHERE stage_key = 'keyword_research';

INSERT INTO seo_knowledge_cards (id, stage_key, "order", title, content, card_type, context_key) VALUES

(gen_random_uuid(), 'keyword_research', 1, 'Qué es el Keyword Research y para qué sirve',
'El Keyword Research es el mapa de tu estrategia SEO. Define qué palabras clave vas a trabajar, en qué orden y con qué URL. Sin este mapa, el trabajo SEO es aleatorio. Con él, cada acción tiene un objetivo claro.',
'concept', NULL),

(gen_random_uuid(), 'keyword_research', 2, 'Cluster = intención de búsqueda = una URL',
'Un cluster agrupa todas las keywords que responden a la misma pregunta del usuario. Google quiere una respuesta definitiva por intención, no varias páginas compitiendo entre sí. Un cluster bien definido = una landing que lo gana todo.',
'concept', NULL),

(gen_random_uuid(), 'keyword_research', 3, 'Por qué buscamos en incógnito',
'Google personaliza los resultados según tu historial. En modo incógnito ves los resultados reales que ve cualquier usuario. Es la única forma de analizar a los competidores reales, no los que Google cree que te interesan a ti.',
'tip', 'target_keyword'),

(gen_random_uuid(), 'keyword_research', 4, 'Cómo leer el volumen de búsqueda',
'El volumen mensual es un promedio anual, no el dato del mes pasado. Una keyword con 320 búsquedas/mes puede tener 600 en temporada alta y 100 en temporada baja. Úsalo como referencia, no como promesa.',
'tip', 'kw_import'),

(gen_random_uuid(), 'keyword_research', 5, 'Palabras clave sin volumen — ¿las incluimos?',
'Sí. Una keyword con volumen 0 en las herramientas puede tener búsquedas reales que no se miden por ser demasiado específicas. Si describe exactamente lo que busca tu cliente ideal, inclúyela. El volumen bajo no significa demanda baja.',
'warning', 'kw_import'),

(gen_random_uuid(), 'keyword_research', 6, '¿Dudas con el clustering?',
'El clustering es la parte más estratégica del Keyword Research. Si tienes dudas sobre cómo agrupar las keywords o qué URL asignar a cada cluster, consúltalo con el Tutor antes de introducirlo en la herramienta.',
'tutor_reminder', NULL);

COMMIT;

-- Verificación rápida al final
SELECT stage_key, COUNT(*) as total_cards
FROM seo_knowledge_cards
WHERE stage_key = 'keyword_research'
GROUP BY stage_key;
