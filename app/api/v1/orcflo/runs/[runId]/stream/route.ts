import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError } from '@/lib/server/http';
import { PlatformError } from '@/lib/domain/errors';

const TERMINAL_EVENT_TYPES = new Set(['run.completed', 'run.failed', 'run.cancelled']);
const MAX_STREAM_HOLD_MS = 60_000;

/**
 * Run stream (SSE) — §11/§36.
 *
 * Replays the append-only run event log in sequence order, then — when
 * the run is still live — subscribes to the in-process RunEventBus and
 * pushes events as the worker produces them (no polling). A final
 * `run.snapshot` carries the latest run aggregate. For terminal runs the
 * replay is followed immediately by the snapshot.
 *
 * Single-process semantics: the bus is in-process; multi-instance
 * deployments replace it with the NATS event bus without changing this
 * contract.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { runId } = await params;
    const platform = getPlatform();
    const run = await platform.orcflo.getRun(context, runId);
    if (!run) throw new PlatformError('NOT_FOUND', `Run ${runId} was not found.`);
    const events = await platform.orcflo.listRunEvents(context, runId);
    const encoder = new TextEncoder();
    const terminal = run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED';

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = (data: string) => {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            // client went away
          }
        };
        const snapshot = async () => {
          const latest = await platform.orcflo.getRun(context, runId);
          if (latest) {
            push(`event: run.snapshot\ndata: ${JSON.stringify({ run: latest })}\n\n`);
          }
        };
        for (const event of events) {
          push(`event: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`);
        }
        if (terminal) {
          await snapshot();
          controller.close();
          return;
        }
        // Live tail: subscribe to the in-process bus until the run is
        // terminal, or a safety hold expires.
        await new Promise<void>((resolve) => {
          const unsub = platform.runEventBus.subscribe(runId, (event) => {
            push(`event: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`);
            if (TERMINAL_EVENT_TYPES.has(event.eventType)) {
              unsub();
              resolve();
            }
          });
          const timer = setTimeout(() => {
            unsub();
            resolve();
          }, MAX_STREAM_HOLD_MS);
          // Ensure the timer never keeps a finished request alive.
          if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
            (timer as { unref: () => void }).unref();
          }
        });
        await snapshot();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
