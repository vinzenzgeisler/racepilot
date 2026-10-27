import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = new URL('./validate-repo-identity.sh', import.meta.url).pathname;
function check(remote, extraEnv = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'repo-identity-'));
  try {
    execFileSync('git', ['init', '-q', directory]);
    if (remote)
      execFileSync('git', ['-C', directory, 'remote', 'add', 'origin', remote]);
    return spawnSync('bash', [script], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ACTIONS: '',
        GITHUB_REPOSITORY: '',
        ...extraEnv,
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('repository identity validation', () => {
  it.each([
    'https://github.com/vinzenzgeisler/racepilot',
    'https://github.com/VinzenzGeisler/RacePilot.git',
    'git@github.com:vinzenzgeisler/racepilot',
    'git@github.com:vinzenzgeisler/racepilot.git',
    'ssh://git@github.com/vinzenzgeisler/racepilot',
    'ssh://git@github.com/vinzenzgeisler/racepilot.git',
  ])('accepts %s', (remote) => expect(check(remote).status).toBe(0));
  it.each([
    'https://github.com/vinzenzgeisler/race-pilot.git',
    'git@github.com:vinzenzgeisler/MSC-Event-Backend.git',
  ])('rejects %s', (remote) => expect(check(remote).status).toBe(1));
  it('rejects missing origin with a clear error', () => {
    const result = check(null);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('origin');
  });
  it('uses GitHub repository identity in Actions', () => {
    const result = check(null, {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'VinzenzGeisler/RacePilot',
    });
    expect(result.status).toBe(0);
  });
  it('supports and displays an expected-repository override', () => {
    const result = check('https://github.com/example/fork.git', {
      RACEPILOT_EXPECTED_REPO: 'example/fork',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('override');
  });
});
