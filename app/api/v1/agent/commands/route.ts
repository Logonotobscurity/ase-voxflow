import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { AgentCommandModalitySchema } from '@/lib/domain/schemas';
import { apiError, apiSuccess, parseJsonBody } from '@/lib/server/http';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';

const AgentCommandRequestSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  modality: AgentCommandModalitySchema.default('TEXT'),
  workflowId: z.string().trim().min(1).max(128).optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const input = AgentCommandRequestSchema.parse(await parseJsonBody(request));
    const platform = getPlatform();
    const proposal = await platform.commands.propose({ ...input, context });
    return apiSuccess({ ...proposal, persistence: platform.persistence }, 202);
  } catch (error) {
    return apiError(error);
  }
}
