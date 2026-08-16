import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError } from '@/lib/server/http';
import { PlatformError } from '@/lib/domain/errors';

/**
 * Run stream (SSE).
 *
 * Replays the append-only run event log in sequence order, then emits a
 * final `run.snapshot` with the run aggregate. Runs in this increment
 * execute synchronously inside `startRun`, so by the time a client
 * subscribes the stream is already complete; the replay contract is the
 * durable half of streaming. Live long-poll subscription behind a
 * background worker is future work (docs/ARCHITECTURE.md §3).
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
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`event: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode(`event: run.snapshot\ndata: ${JSON.stringify({ run })}\n\n`));
        controller.close();
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
