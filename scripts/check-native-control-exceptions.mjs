import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const exceptions = JSON.parse(
  readFileSync('scripts/native-control-exceptions.json', 'utf8'),
);
const baseline = JSON.parse(
  readFileSync('scripts/native-control-exceptions-baseline.json', 'utf8'),
);
const baselineSet = new Set(baseline);
const additions = exceptions.filter((path) => !baselineSet.has(path));
if (additions.length)
  throw new Error(
    `Raw-control exceptions may only shrink: ${additions.join(', ')}`,
  );
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
const sourceFiles = walk('packages/app/src').filter((path) =>
  path.endsWith('.tsx'),
);
const rawControl = /<\s*(?:button|input|select|textarea|table)(?:\s|\/?>)/;
const present = sourceFiles
  .filter((path) => rawControl.test(readFileSync(path, 'utf8')))
  .map((path) => relative(root, resolve(path)));
const unknown = present.filter((path) => !exceptions.includes(path));
const stale = exceptions.filter(
  (path) => !existsSync(path) || !present.includes(path),
);
if (unknown.length || stale.length) {
  throw new Error(
    [
      unknown.length
        ? `Raw controls need a component: ${unknown.join(', ')}`
        : '',
      stale.length
        ? `Remove resolved raw-control exceptions: ${stale.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}
console.log(
  `Native-control gate active; ${present.length} temporary file exceptions remain.`,
);
