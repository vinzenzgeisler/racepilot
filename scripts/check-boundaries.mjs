import { rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const probe = 'packages/app/src/__boundary_probe__.ts';
try {
  writeFileSync(
    probe,
    "import { organizationId } from '../../core/src/index.js';\nvoid organizationId;\n",
  );
  const result = spawnSync(
    'npx',
    ['depcruise', '--config', '.dependency-cruiser.cjs', probe],
    { encoding: 'utf8' },
  );
  if (result.status === 0) {
    process.stderr.write(
      'Boundary probe unexpectedly passed for app -> core import.\n',
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      'Boundary probe correctly rejected a forbidden app -> core import.\n',
    );
  }
} finally {
  rmSync(probe, { force: true });
}
