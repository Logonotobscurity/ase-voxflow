import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const EventFireSchema = z.object({
  eventType: z.string().regex(/^[a-z][a-z0-9_.-]+$/),
  input: z.record(z.string(), z.unknown()).default({}),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const body = await request.json().catch(() => ({}));
    const parsed = EventFireSchema.parse(body);
    const platform = getPlatform();
    const runs = await platform.triggers.fireEventTrigger(context, parsed.eventType, parsed.input);
    return apiSuccess({ runs, persistence: platform.persistence }, 200);
  } catch (error) {
    return apiError(error);
  }
}
