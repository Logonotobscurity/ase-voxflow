import type { OrcfloRun } from '../domain/orcflo';
import type { Clock, OrcfloRuntimePorts } from './ports';
import type { OrcfloEngine } from './orcflo-engine';

const wallClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

/**
 * §25/§36 durable execution — the run worker.
 *
 * Claims PENDING runs with a lease (multi-worker safe, mirroring the
 * outbox claim/lease protocol), executes them through
 * `OrcfloEngine.executeRun`, then releases the claim once the run is
 * parked (WAITING_APPROVAL) or terminal. A worker whose lease expires
 * while it is gone lets another worker reclaim and continue; lease
 * renewal/heartbeat is future work.
 */
export class RunDispatcher {
  constructor(
    private readonly engine: OrcfloEngine,
    private readonly ports: OrcfloRuntimePorts,
    private readonly clock: Clock = wallClock,
    private readonly options: {
      /** Worker identity for claim ownership; default run-worker-<pid>. */
      workerId?: string;
      /** Lease duration ms before another worker may reclaim; default 60s. */
      leaseMs?: number;
      /** Max runs claimed per tick; default 10. */
      limit?: number;
    } = {},
  ) {}

  get workerId(): string {
    return this.options.workerId ?? `run-worker-${process.pid}`;
  }

  async tick(): Promise<OrcfloRun[]> {
    const leaseMs = Math.max(100, Math.trunc(this.options.leaseMs ?? 60_000));
    const limit = Math.max(1, Math.min(Math.trunc(this.options.limit ?? 10), 100));
    const claimed = await this.ports.runs.claimBatch(this.workerId, leaseMs, limit);
    const executed: OrcfloRun[] = [];
    for (const run of claimed) {
      try {
        executed.push(await this.engine.executeRun(run.id, { workerId: this.workerId }));
      } catch (error) {
        // executeRun persists failures itself; this guard prevents a
        // poisoned run from stopping the whole worker tick.
        console.error('[run-dispatcher] execute failed', { runId: run.id, error });
      } finally {
        // Parked (WAITING_APPROVAL) and terminal runs no longer need the
        // claim; a conditional release never clears another worker's lease.
        await this.ports.runs.releaseClaim(run.id, this.workerId).catch(() => {});
      }
    }
    return executed;
  }
}
