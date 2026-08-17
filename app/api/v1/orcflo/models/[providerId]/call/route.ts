import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const CallModelSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  maxTokens: z.number().int().min(1).max(4_096).default(256),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { providerId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = CallModelSchema.parse(body);
    const platform = getPlatform();
    const result = await platform.orcflo.callModel(context, { providerId, ...input });
    return apiSuccess({ result, persistence: platform.persistence }, 200);
  } catch (error) {
    return apiError(error);
  }
}
