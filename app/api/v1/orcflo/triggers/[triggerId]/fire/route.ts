import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const FireInputSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ triggerId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { triggerId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = FireInputSchema.parse(body);
    const platform = getPlatform();
    const run = await platform.triggers.fireManual(context, triggerId, parsed.input, parsed.idempotencyKey);
    return apiSuccess({ run, persistence: platform.persistence }, 202);
  } catch (error) {
    return apiError(error);
  }
}
