import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const RequestTransactionSchema = z.object({
  type: z.string().min(1).max(100),
  amountMinor: z.number().int().positive().max(1_000_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  recipient: z.string().min(1).max(200),
  idempotencyKey: z.string().min(8).max(200),
  agentId: z.string().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const input = RequestTransactionSchema.parse(await request.json());
    const platform = getPlatform();
    const result = await platform.transactions.request({ ...input, context });
    return apiSuccess({ ...result, persistence: platform.persistence }, 202);
  } catch (error) {
    return apiError(error);
  }
}
