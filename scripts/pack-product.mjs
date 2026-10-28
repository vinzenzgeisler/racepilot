import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(
  root,
  process.env.RACEPILOT_PACK_DIR ?? 'product-artifacts',
);
const rootManifest = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const packagesDirectory = path.join(root, 'packages');
const directories = (await readdir(packagesDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDirectory, entry.name));
const packages = [];
const expectedPackageCount = directories.filter((directory) => {
  try {
    return JSON.parse(
      execFileSync('cat', [path.join(directory, 'package.json')], {
        encoding: 'utf8',
      }),
    ).name?.startsWith('@racepilot/');
  } catch {
    return false;
  }
}).length;
await mkdir(output, { recursive: true });

for (const directory of directories) {
  const manifestPath = path.join(directory, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    continue;
  }
  if (!manifest.name?.startsWith('@racepilot/')) continue;
  if (manifest.private || manifest.version !== '0.1.0') {
    throw new Error(`${manifest.name} must be a non-private 0.1.0 package`);
  }
  for (const dependency of Object.keys(manifest.dependencies ?? {}).filter(
    (name) => name.startsWith('@racepilot/'),
  )) {
    if (manifest.dependencies[dependency] !== manifest.version) {
      throw new Error(
        `${manifest.name} has an unpinned internal dependency: ${dependency}`,
      );
    }
  }

  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', output],
    { cwd: directory, encoding: 'utf8' },
  );
  const [packed] = JSON.parse(packOutput);
  const filePath = path.join(output, packed.filename);
  const bytes = await readFile(filePath);
  const packedFiles = packed.files.map(({ path: file }) => file).sort();
  const allowed = packedFiles.every(
    (file) =>
      file === 'package.json' ||
      file === 'README.md' ||
      file === 'LICENSE' ||
      file.startsWith('dist/') ||
      file.startsWith('migrations/') ||
      file.startsWith('fonts/'),
  );
  if (!allowed) {
    throw new Error(
      `${manifest.name} contains files outside its pack allowlist`,
    );
  }
  packages.push({
    name: manifest.name,
    version: manifest.version,
    filename: packed.filename,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    npmIntegrity: packed.integrity,
    files: packedFiles,
  });
}

if (packages.length !== expectedPackageCount) {
  throw new Error('Not every RacePilot workspace was packed');
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (!/^[0-9a-f]{40}$/.test(commit))
  throw new Error('Unable to identify source commit');
await writeFile(
  path.join(output, 'product-artifacts.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: { repository: 'vinzenzgeisler/racepilot', commit },
      packageManager: rootManifest.packageManager,
      packages: packages.sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    },
    null,
    2,
  )}\n`,
);
console.log(`Packed ${packages.length} packages from ${commit} into ${output}`);
