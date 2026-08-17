import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { WorkflowStatusSchema } from '@/lib/domain/schemas';

const InstantiateSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  workflowName: z.string().trim().min(2).max(200).optional(),
  status: WorkflowStatusSchema.default('DRAFT'),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ blueprintId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { blueprintId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = InstantiateSchema.parse(body);
    const platform = getPlatform();
    const workflow = await platform.blueprints.instantiate(context, blueprintId, parsed);
    return apiSuccess({ workflow, persistence: platform.persistence }, 201);
  } catch (error) {
    return apiError(error);
  }
}
