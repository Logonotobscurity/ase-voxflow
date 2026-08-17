import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const StartRunSchema = z.object({
  workflowId: z.string().min(1).max(128),
  input: z.record(z.string(), z.unknown()).default({}),
  triggerId: z.string().min(1).max(128).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  maxDurationMs: z.number().int().min(100).max(120_000).default(30_000),
  maxCostMinor: z.number().int().nonnegative().max(100_000_000).default(100_000),
  maxNodeExecutions: z.number().int().min(1).max(10_000).optional(),
  maxConcurrency: z.number().int().min(1).max(32).optional(),
  /**
   * §25/§36 durable execution — when true, the run is created as PENDING
   * and executed by the in-process run worker instead of synchronously.
   * The response returns 202 with the PENDING run; the run stream shows
   * progress live.
   */
  async: z.boolean().default(false),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const workflowId = request.nextUrl.searchParams.get('workflowId') ?? undefined;
    const limitRaw = request.nextUrl.searchParams.get('limit');
    const platform = getPlatform();
    const runs = await platform.orcflo.listRuns(context, {
      workflowId,
      limit: limitRaw ? Number.parseInt(limitRaw, 10) : undefined,
    });
    return apiSuccess({ runs, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const body = await request.json().catch(() => ({}));
    const input = StartRunSchema.parse(body);
    const platform = getPlatform();
    const params = {
      workflowId: input.workflowId,
      input: input.input,
      context,
      triggerId: input.triggerId,
      idempotencyKey: input.idempotencyKey,
      maxDurationMs: input.maxDurationMs,
      maxCostMinor: input.maxCostMinor,
      maxNodeExecutions: input.maxNodeExecutions,
      maxConcurrency: input.maxConcurrency,
    };
    if (input.async) {
      const run = await platform.orcflo.createRun(params);
      return apiSuccess({ run, queued: true, persistence: platform.persistence }, 202);
    }
    const run = await platform.orcflo.startRun(params);
    return apiSuccess({ run, persistence: platform.persistence }, 202);
  } catch (error) {
    return apiError(error);
  }
}
