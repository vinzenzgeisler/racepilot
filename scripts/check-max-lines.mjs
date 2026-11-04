import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const limit = 300;
const exceptions = JSON.parse(
  await readFile('scripts/max-lines-exceptions.json', 'utf8'),
);
const baseline = JSON.parse(
  await readFile('scripts/max-lines-baseline.json', 'utf8'),
);
const baselineSet = new Set(baseline);
const additions = exceptions.filter((file) => !baselineSet.has(file));
if (additions.length)
  throw new Error(
    `max-lines exceptions may only shrink; additions: ${additions.join(', ')}`,
  );
const listed = new Set(exceptions);
const paths = execFileSync('git', ['ls-files', 'packages', 'scripts'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');
const sourceFiles = paths.filter(
  (file) =>
    /\.(?:[cm]?[jt]sx?|css)$/.test(file) &&
    !/(?:\.test|\.spec)\.[^.]+$/.test(file) &&
    !file.includes('/e2e/'),
);
const failures = [];
for (const file of sourceFiles) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  let inBlockComment = false;
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*')
    ) {
      if (trimmed.startsWith('/*') && !trimmed.includes('*/'))
        inBlockComment = true;
      continue;
    }
    count++;
  }
  if (count > limit && !listed.has(file))
    failures.push(
      `${file}: ${count} lines exceeds ${limit} and is not excepted`,
    );
  if (count <= limit && listed.has(file))
    failures.push(`${file}: remove stale exception (${count} lines)`);
}
if (failures.length) throw new Error(failures.join('\n'));
console.log(
  `max-lines check passed (${exceptions.length} explicit exceptions)`,
);
