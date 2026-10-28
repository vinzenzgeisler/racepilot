import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCleanSourceCommit } from './pack-source.mjs';

describe('pack source identity', () => {
  it('identifies a clean tracked tree and fails closed on tracked edits', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'racepilot-source-test-'),
    );
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.invalid',
          'commit',
          '--allow-empty',
          '-qm',
          'initial',
        ],
        { cwd: root },
      );
      const commit = getCleanSourceCommit(root);
      expect(commit).toMatch(/^[0-9a-f]{40}$/);
      await writeFile(path.join(root, 'tracked.txt'), 'change');
      execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.invalid',
          'commit',
          '-qm',
          'tracked',
        ],
        { cwd: root },
      );
      await writeFile(path.join(root, 'tracked.txt'), 'modified');
      expect(() => getCleanSourceCommit(root)).toThrow(
        /dirty tracked source tree/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
