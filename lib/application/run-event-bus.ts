import { EventEmitter } from 'node:events';
import type { OrcfloRunEvent } from '../domain/orcflo';

/**
 * §11/§36 — in-process live run stream.
 *
 * The engine publishes every appended run event here; SSE subscribers
 * receive live events without polling. Single-process semantics: a
 * NATS-backed bus replaces this in multi-instance deployments without
 * changing the engine (the engine only calls `publish`).
 */
export class RunEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: OrcfloRunEvent): void {
    this.emitter.emit(event.runId, event);
  }

  /** Subscribe to live events for one run; returns an unsubscribe fn. */
  subscribe(runId: string, listener: (event: OrcfloRunEvent) => void): () => void {
    this.emitter.on(runId, listener);
    return () => {
      this.emitter.off(runId, listener);
    };
  }
}
