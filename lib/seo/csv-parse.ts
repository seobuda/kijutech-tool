// Parser CSV mínimo, sin librerías externas. Soporta campos entre comillas
// que contienen comas, saltos de línea y comillas escapadas (""), que es lo
// que exporta SE Ranking en la columna "Funciones SERP".
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      i++;
      continue;
    }
    field += char;
    i++;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export const SERANKING_CSV_HEADERS = [
  'Palabra clave',
  'Dificultad',
  'Posición',
  'Posición anterior',
  'Vol. de búsqueda',
  'Funciones SERP',
  'URL'
];

export type SeRankingCsvParsedRow = {
  keyword: string;
  difficulty: number | null;
  position: number | null;
  prevPosition: number | null;
  volume: number | null;
  serpFeatures: string | null;
  url: string | null;
};

function toIntOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseInt(value.trim().replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isSeRankingCsvHeader(headerRow: string[]): boolean {
  if (headerRow.length !== SERANKING_CSV_HEADERS.length) return false;
  return headerRow.every(
    (cell, i) => cell.trim() === SERANKING_CSV_HEADERS[i]
  );
}

export function parseSeRankingCsvRows(rows: string[][]): SeRankingCsvParsedRow[] {
  return rows.slice(1).map((row) => ({
    keyword: (row[0] ?? '').trim(),
    difficulty: toIntOrNull(row[1]),
    position: toIntOrNull(row[2]),
    prevPosition: toIntOrNull(row[3]),
    volume: toIntOrNull(row[4]),
    serpFeatures: row[5]?.trim() || null,
    url: row[6]?.trim() || null
  }));
}
