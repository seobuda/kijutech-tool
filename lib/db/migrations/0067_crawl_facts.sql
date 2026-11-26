-- SEO parte 1, técnico 2a (26 nov 2026; docs/DISENO-SEO-PARTE1.md). Aditiva: hechos acotados de cada página rastreada
-- (núcleo, crawl_pages): enlaces a otras webs (≤ 100) y recursos CSS/JS (≤ 40), para comprobar enlaces rotos hacia fuera
-- y si robots.txt bloquea a Google recursos de la web. Anulable: el código anterior no la usa.
ALTER TABLE "crawl_pages" ADD COLUMN IF NOT EXISTS "facts" jsonb;
