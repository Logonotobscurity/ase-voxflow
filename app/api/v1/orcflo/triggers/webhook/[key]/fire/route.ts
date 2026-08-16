import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const WebhookFireSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
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
    // §48 — explicit key wins (header Idempotency-Key, else body
    // idempotencyKey); otherwise the service derives one from
    // (trigger, payload) so duplicate deliveries dedupe.
    const headerKey = request.headers.get('idempotency-key') ?? undefined;
    const platform = getPlatform();
    const run = await platform.triggers.fireWebhook(context, key, parsed.input, {
      idempotencyKey: headerKey ?? parsed.idempotencyKey,
    });
    return apiSuccess({ run, persistence: platform.persistence }, 202);
  } catch (error) {
    return apiError(error);
  }
}
