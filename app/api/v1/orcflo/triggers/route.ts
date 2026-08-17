import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { OrcfloTriggerKindSchema } from '@/lib/domain/orcflo';
import { MetadataSchema } from '@/lib/domain/schemas';

const CreateTriggerSchema = z.object({
  workflowId: z.string().min(1).max(128),
  name: z.string().trim().min(2).max(100),
  kind: OrcfloTriggerKindSchema,
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
  metadata: MetadataSchema,
}).strict();

export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const kindParam = request.nextUrl.searchParams.get('kind');
    const platform = getPlatform();
    const triggers = await platform.triggers.list(context, {
      kind: kindParam && ['manual', 'schedule', 'webhook', 'event', 'public'].includes(kindParam)
        ? kindParam as 'manual' | 'schedule' | 'webhook' | 'event' | 'public'
        : undefined,
    });
    return apiSuccess({ triggers, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const body = await request.json().catch(() => ({}));
    const input = CreateTriggerSchema.parse(body);
    const platform = getPlatform();
    const trigger = await platform.triggers.create(context, input);
    return apiSuccess({ trigger, persistence: platform.persistence }, 201);
  } catch (error) {
    return apiError(error);
  }
}
