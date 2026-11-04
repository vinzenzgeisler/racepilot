import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');

const snapshotPath = 'scripts/public-exports.snapshot.json';
const options = {
  allowJs: true,
  checkJs: false,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
};
const roots = ts.sys.readDirectory(
  'packages',
  ['.ts', '.tsx', '.js', '.jsx'],
  ['**/*.test.*', '**/*.spec.*', '**/dist/**', '**/node_modules/**'],
);
const program = ts.createProgram(roots, options);
const checker = program.getTypeChecker();
const current = {};
for (const file of roots
  .filter((path) => /\/src\/index\.ts$/.test(path))
  .sort()) {
  const source = program.getSourceFile(file);
  if (!source?.symbol) throw new Error(`Cannot inspect public barrel: ${file}`);
  current[file] = checker
    .getExportsOfModule(source.symbol)
    .map((symbol) => symbol.getName())
    .sort();
}
if (process.argv.includes('--write')) {
  await writeFile(snapshotPath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Wrote ${snapshotPath}`);
} else {
  const expected = JSON.parse(await readFile(snapshotPath, 'utf8'));
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error(
      `Public exports changed. Review ${snapshotPath} only when an intentional public API change is approved.`,
    );
  }
  console.log(
    `Public export snapshot unchanged (${Object.keys(current).length} packages)`,
  );
}
