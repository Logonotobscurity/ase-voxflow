import type { OrcfloRun } from '../domain/orcflo';
import type { Clock } from './ports';
import type { OrcfloTriggerService } from './orcflo-triggers';

const wallClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

/**
 * §32/§25 durable scheduling — the in-process schedule worker.
 *
 * Drains due schedule triggers across all tenants on a tick, materializing
 * one run per due minute bucket (the cron matcher + lastFiredAt guarantee
 * at-most-once-per-bucket). The deterministic authority is the pure cron
 * module; this loop just drives it. Multi-instance deployments need a
 * lease/claim around the drain (future work), mirroring the outbox.
 */
export class ScheduleDispatcher {
  constructor(
    private readonly triggers: OrcfloTriggerService,
    private readonly clock: Clock = wallClock,
  ) {}

  async tick(): Promise<OrcfloRun[]> {
    return this.triggers.drainSchedulesGlobal(this.clock.isoNow());
  }
}
