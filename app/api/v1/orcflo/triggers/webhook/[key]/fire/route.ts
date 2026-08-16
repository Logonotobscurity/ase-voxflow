import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const WebhookFireSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { key } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = WebhookFireSchema.parse(body);
    const platform = getPlatform();
    const run = await platform.triggers.fireWebhook(context, key, parsed.input);
    return apiSuccess({ run, persistence: platform.persistence }, 202);
  } catch (error) {
    return apiError(error);
  }
}
