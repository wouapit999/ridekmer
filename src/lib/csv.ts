/**
 * CSV export helpers hardened against spreadsheet formula injection: any cell starting with
 * =, +, -, @, tab or carriage return is prefixed with a single quote.
 */
const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (DANGEROUS_PREFIX.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const header = cols.map(escapeCsvCell).join(",");
  const body = rows.map((row) => cols.map((c) => escapeCsvCell(row[c])).join(","));
  return [header, ...body].join("\r\n");
}
