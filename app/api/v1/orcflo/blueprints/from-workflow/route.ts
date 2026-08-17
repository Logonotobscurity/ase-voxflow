import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { MetadataSchema } from '@/lib/domain/schemas';

const FromWorkflowSchema = z.object({
  workflowId: z.string().min(1).max(128),
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1_000).optional(),
  metadata: MetadataSchema,
}).strict();

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const body = await request.json().catch(() => ({}));
    const input = FromWorkflowSchema.parse(body);
    const platform = getPlatform();
    const blueprint = await platform.blueprints.createFromWorkflow(context, input);
    return apiSuccess({ blueprint, persistence: platform.persistence }, 201);
  } catch (error) {
    return apiError(error);
  }
}
