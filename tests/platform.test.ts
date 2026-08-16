import { afterEach, describe, expect, it, vi } from 'vitest';
import { workflowFixture } from './helpers';

vi.mock('server-only', () => ({}));

import { getPlatform } from '../lib/server/platform';

const processState = globalThis as unknown as {
  asePlatform?: ReturnType<typeof getPlatform>;
};

const originalPersistenceMode = process.env.ASE_PERSISTENCE_MODE;

afterEach(() => {
  delete processState.asePlatform;
  if (originalPersistenceMode === undefined) delete process.env.ASE_PERSISTENCE_MODE;
  else process.env.ASE_PERSISTENCE_MODE = originalPersistenceMode;
});

describe('platform composition root', () => {
  it('reuses one process-local application and preserves memory state across calls', async () => {
    process.env.ASE_PERSISTENCE_MODE = 'memory';
    delete processState.asePlatform;

    const first = getPlatform();
    const workflow = workflowFixture({ id: 'workflow_continuity' });
    await first.ports.workflows.save(workflow);

    const second = getPlatform();

    expect(second).toBe(first);
    expect(second.ports).toBe(first.ports);
    await expect(second.ports.workflows.findById(workflow.tenantId, workflow.id)).resolves.toEqual(workflow);
  });

  it('wires the outbox dispatcher with start/stop controls', () => {
    process.env.ASE_PERSISTENCE_MODE = 'memory';
    delete processState.asePlatform;
    const platform = getPlatform();
    expect(platform.outboxDispatcher).toBeDefined();
    expect(typeof platform.outboxDispatcher.tick).toBe('function');
    expect(typeof platform.startOutboxDispatcherLoop).toBe('function');
    expect(typeof platform.stopOutboxDispatcherLoop).toBe('function');
    // Loop is opt-in: it must NOT auto-start when getPlatform() is called.
    platform.startOutboxDispatcherLoop();
    platform.startOutboxDispatcherLoop();
    platform.stopOutboxDispatcherLoop();
    platform.stopOutboxDispatcherLoop();
    expect(platform.outboxDispatcher).toBeDefined();
  });
});
