import { describe, expect, it, vi } from 'vitest';
import { composeWorkerTasks } from './index.js';

describe('worker task composition', () => {
  it('composes shared and assembly-owned handlers and runs the selected task', async () => {
    const shared = vi.fn(async () => {});
    const assembly = vi.fn(async () => {});
    const tasks = composeWorkerTasks(
      { 'shared.health-check': shared },
      { 'private-example.refresh': assembly },
    );
    await tasks['private-example.refresh']?.({}, { job: { id: 'job-1' } });
    expect(assembly).toHaveBeenCalledOnce();
    expect(shared).not.toHaveBeenCalled();
  });

  it('fails closed on invalid names and attempts to replace shared work', () => {
    const task = async () => {};
    expect(() =>
      composeWorkerTasks(
        { 'shared.health-check': task },
        { 'shared.health-check': task },
      ),
    ).toThrow(/already registered/);
    expect(() => composeWorkerTasks({ 'Capitalized.Task': task })).toThrow(
      /Invalid worker task name/,
    );
  });
});
