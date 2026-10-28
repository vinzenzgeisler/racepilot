import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const artifactDirectory = path.resolve(process.argv[2]);
const manifest = JSON.parse(
  await readFile(path.join(artifactDirectory, 'product-artifacts.json'), 'utf8'),
);
const archive = (name) => {
  const artifact = manifest.packages.find((entry) => entry.name === name);
  if (!artifact) throw new Error(`Missing packed artifact ${name}`);
  return path.join(artifactDirectory, artifact.filename);
};
const consumer = await mkdtemp(path.join(os.tmpdir(), 'racepilot-ui-types-'));

try {
  await writeFile(
    path.join(consumer, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  await writeFile(
    path.join(consumer, 'consumer.tsx'),
    [
      "import { App, type AppProps } from '@racepilot/app/ui';",
      'const props: AppProps = { renderContribution: (config) => config.organization.name };',
      'void App; void props;',
      '',
    ].join('\n'),
  );
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      archive('@racepilot/contracts'),
      archive('@racepilot/app'),
      'typescript@^5.9.3',
      '@types/react@^19.2.0',
    ],
    { cwd: consumer, stdio: 'inherit' },
  );
  execFileSync(
    path.join(consumer, 'node_modules', '.bin', 'tsc'),
    [
      '--noEmit',
      '--strict',
      '--jsx',
      'react-jsx',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'consumer.tsx',
    ],
    { cwd: consumer, stdio: 'inherit' },
  );
  console.log('Packed @racepilot/app/ui declarations compile in isolated consumer');
} finally {
  await rm(consumer, { recursive: true, force: true });
}
