import { existsSync, readFileSync } from 'node:fs';
const exceptions = JSON.parse(
  readFileSync('scripts/stylelint-exceptions.json', 'utf8'),
);
const baseline = JSON.parse(
  readFileSync('scripts/stylelint-exceptions-baseline.json', 'utf8'),
);
const additions = exceptions.filter((path) => !baseline.includes(path));
const missing = exceptions.filter((path) => !existsSync(path));
if (additions.length)
  throw new Error(
    `Stylelint exceptions may only shrink: ${additions.join(', ')}`,
  );
if (missing.length)
  throw new Error(`Remove missing Stylelint exceptions: ${missing.join(', ')}`);
console.log(
  `Stylelint token gate active; ${exceptions.length} legacy CSS exceptions remain.`,
);
