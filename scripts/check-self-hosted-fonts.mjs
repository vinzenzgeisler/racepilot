import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const cssDirectory = 'packages/app/dist/assets';
const cssFiles = readdirSync(cssDirectory).filter((file) =>
  file.endsWith('.css'),
);
if (cssFiles.length === 0)
  throw new Error('No built CSS found to verify local fonts.');
const css = cssFiles
  .map((file) => readFileSync(join(cssDirectory, file), 'utf8'))
  .join('\n');
if (/https?:\/\//i.test(css))
  throw new Error(
    'Built CSS contains a remote URL; fonts/assets must be self-hosted.',
  );
for (const family of ['Archivo Variable', 'IBM Plex Sans', 'IBM Plex Mono']) {
  if (!css.includes(family)) throw new Error(`Built CSS is missing ${family}.`);
}
process.stdout.write(
  'Built CSS contains all self-hosted font families and no remote URLs.\n',
);
