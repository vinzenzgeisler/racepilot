export type EntryExportField =
  'driver' | 'vehicle' | 'class' | 'startNumber' | 'status' | 'price';

export const entryExportFields: readonly EntryExportField[] = [
  'driver',
  'vehicle',
  'class',
  'startNumber',
  'status',
  'price',
];

/** Protect spreadsheet consumers from formula execution, including control-character prefixes. */
export function csvSafeCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value);
  // Spreadsheet applications may ignore leading whitespace/control/format chars
  // before formula markers. Keep the original cell but prefix an apostrophe when
  // its first significant character would otherwise start a formula.
  if (/^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function renderEntryCsv(
  rows: readonly (readonly (string | number | null | undefined)[])[],
  delimiter: ',' | ';' = ';',
): string {
  return (
    rows.map((row) => row.map(csvSafeCell).join(delimiter)).join('\r\n') +
    '\r\n'
  );
}
