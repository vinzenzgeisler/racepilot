import { execFileSync } from 'node:child_process';

export function getCleanSourceCommit(root) {
  const status = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  if (status.trim()) {
    throw new Error(
      'Refusing to identify a dirty tracked source tree as its HEAD commit',
    );
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error('Unable to identify source commit');
  return commit;
}
