import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const DrainSchema = z.object({
  now: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(50).default(10),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const body = await request.json().catch(() => ({}));
    const parsed = DrainSchema.parse(body);
    const platform = getPlatform();
    const runs = await platform.triggers.drainSchedules(context, parsed.now, parsed.limit);
    return apiSuccess({ runs, persistence: platform.persistence }, 200);
  } catch (error) {
    return apiError(error);
  }
}
