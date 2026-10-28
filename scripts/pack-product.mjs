import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCleanSourceCommit } from './pack-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(
  root,
  process.env.RACEPILOT_PACK_DIR ?? 'product-artifacts',
);
const rootManifest = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
);
const release = JSON.parse(
  await readFile(path.join(root, 'product-release.json'), 'utf8'),
);
if (
  typeof release.version !== 'string' ||
  !/^\d+\.\d+\.\d+$/.test(release.version)
) {
  throw new Error('product-release.json must define an exact x.y.z version');
}
const commit = getCleanSourceCommit(root);
const packagesDirectory = path.join(root, 'packages');
const directories = (await readdir(packagesDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDirectory, entry.name));
const packages = [];
let expectedPackageCount = 0;
for (const directory of directories) {
  try {
    if (
      JSON.parse(
        await readFile(path.join(directory, 'package.json'), 'utf8'),
      ).name?.startsWith('@racepilot/')
    )
      expectedPackageCount += 1;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await mkdir(output, { recursive: true });
const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'racepilot-pack-'));

try {
  for (const directory of directories) {
    const manifestPath = path.join(directory, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    if (!manifest.name?.startsWith('@racepilot/')) continue;
    if (manifest.private !== true) {
      throw new Error(
        `${manifest.name} must remain private to block registry publication`,
      );
    }
    const stagedManifest = { ...manifest, version: release.version };
    stagedManifest.dependencies = { ...manifest.dependencies };
    for (const dependency of Object.keys(stagedManifest.dependencies).filter(
      (name) => name.startsWith('@racepilot/'),
    )) {
      stagedManifest.dependencies[dependency] = release.version;
    }

    const stage = path.join(stagingRoot, manifest.name.split('/')[1]);
    await mkdir(stage, { recursive: true });
    await writeFile(
      path.join(stage, 'package.json'),
      `${JSON.stringify(stagedManifest, null, 2)}\n`,
    );
    for (const entry of [
      'dist',
      'migrations',
      'fonts',
      'README.md',
      'LICENSE',
    ]) {
      try {
        await cp(path.join(directory, entry), path.join(stage, entry), {
          recursive: true,
        });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const packOutput = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', output],
      { cwd: stage, encoding: 'utf8' },
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
      version: release.version,
      filename: packed.filename,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      npmIntegrity: packed.integrity,
      files: packedFiles,
    });
  }

  if (packages.length !== expectedPackageCount) {
    throw new Error('Not every RacePilot workspace was packed');
  }

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
  execFileSync(
    process.execPath,
    [path.join(root, 'scripts/check-packed-ui-types.mjs'), output],
    { stdio: 'inherit' },
  );
  console.log(
    `Packed ${packages.length} packages at ${release.version} from ${commit} into ${output}`,
  );
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
