import { z } from 'zod';
import type { RequestContext } from '@racepilot/core';

export const MeasurementSchema = z
  .object({
    entryId: z.string().uuid().optional(),
    startNumber: z.string().trim().min(1).max(32).optional(),
    run: z.number().int().min(1),
    timeMs: z.number().int().positive(),
    penaltyMs: z.number().int().min(0).default(0),
    exclusion: z.enum(['DNF', 'DNS', 'DSQ']).optional(),
    source: z.string().trim().min(1).max(200).default('manual'),
    recordedAt: z
      .string()
      .datetime({ offset: true })
      .default(() => new Date().toISOString()),
  })
  .strict()
  .refine(
    (x) => Boolean(x.entryId) !== Boolean(x.startNumber),
    'Supply exactly one of entryId or startNumber',
  );
export const CsvRequest = z
  .object({ csv: z.string().min(1).max(2_000_000), dryRun: z.boolean() })
  .strict();
export const CorrectionSchema = z
  .object({
    entryId: z.string().uuid().optional(),
    startNumber: z.string().trim().min(1).max(32).optional(),
    run: z.number().int().min(1).optional(),
    timeMs: z.number().int().positive().optional(),
    penaltyMs: z.number().int().min(0).optional(),
    exclusion: z.enum(['DNF', 'DNS', 'DSQ']).nullable().optional(),
    source: z.string().trim().min(1).max(200).optional(),
    recordedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (x) =>
      Boolean(x.entryId) !== Boolean(x.startNumber) ||
      (!x.entryId && !x.startNumber),
    'Supply at most one entry selector',
  )
  .refine(
    (x) =>
      ['run', 'timeMs', 'penaltyMs', 'exclusion', 'source', 'recordedAt'].some(
        (key) => Object.hasOwn(x, key),
      ),
    'Correction cannot be empty',
  );
export const splitCSV = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
};
export const safeCSVCell = (value: unknown) => {
  let text = String(value ?? '');
  // Spreadsheet engines may interpret leading controls/whitespace before a formula.
  // eslint-disable-next-line no-control-regex
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
};
export const actor = (ctx: RequestContext) =>
  ctx.subject ? `${ctx.subject.issuer}|${ctx.subject.subject}` : 'unknown';
