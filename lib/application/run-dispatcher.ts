import type { OrcfloRun } from '../domain/orcflo';
import type { Clock, OrcfloRuntimePorts } from './ports';
import type { OrcfloEngine } from './orcflo-engine';

const wallClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

/**
 * §25/§36 durable execution — the in-process run worker.
 *
 * Drains PENDING runs and executes them through `OrcfloEngine.executeRun`.
 * Terminal/running runs are no-ops, so re-ticking over the same list is
 * safe. Single-worker semantics in this increment (the platform is a
 * modular monolith); multi-worker claim/lease is future work — the same
 * pattern the outbox claim/lease increment will generalize.
 */
export class RunDispatcher {
  constructor(
    private readonly engine: OrcfloEngine,
    private readonly ports: OrcfloRuntimePorts,
    private readonly clock: Clock = wallClock,
    private readonly options: { limit?: number } = {},
  ) {}

  async tick(): Promise<OrcfloRun[]> {
    const limit = Math.max(1, Math.min(Math.trunc(this.options.limit ?? 10), 100));
    const pending = await this.ports.runs.listPending(limit);
    const executed: OrcfloRun[] = [];
    for (const run of pending) {
      try {
        executed.push(await this.engine.executeRun(run.id));
      } catch (error) {
        // executeRun persists failures itself; this guard prevents a
        // poisoned run from stopping the whole worker tick.
        console.error('[run-dispatcher] execute failed', { runId: run.id, error });
      }
    }
    return executed;
  }
}
