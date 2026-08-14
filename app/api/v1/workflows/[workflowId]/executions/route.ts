import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const ExecuteWorkflowSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  maxDurationMs: z.number().int().min(100).max(120_000).default(30_000),
  maxCostMinor: z.number().int().nonnegative().max(100_000_000).default(100_000),
}).strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const context = getRequestContext(request);
    const { workflowId } = await params;
    const platform = getPlatform();
    const executions = await platform.ports.executions.listForWorkflow(context.tenantId, workflowId);
    return apiSuccess({ executions, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const context = getRequestContext(request);
    const { workflowId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = ExecuteWorkflowSchema.parse(body);
    const platform = getPlatform();
    const result = await platform.workflows.run({ workflowId, context, ...input });
    return apiSuccess({ ...result, persistence: platform.persistence }, 202);
  } catch (error) {
    return apiError(error);
  }
}
