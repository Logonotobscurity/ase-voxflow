import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { ModelProviderKindSchema } from '@/lib/domain/orcflo';

const SaveModelProviderSchema = z.object({
  name: z.string().trim().min(2).max(100),
  kind: ModelProviderKindSchema,
  model: z.string().trim().min(1).max(200).optional(),
  endpoint: z.string().trim().min(1).max(500).optional(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const platform = getPlatform();
    const providers = await platform.orcflo.listModelProviders(context);
    return apiSuccess({ providers, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const body = await request.json().catch(() => ({}));
    const input = SaveModelProviderSchema.parse(body);
    const platform = getPlatform();
    const provider = await platform.orcflo.saveModelProvider(context, input);
    return apiSuccess({ provider, persistence: platform.persistence }, 201);
  } catch (error) {
    return apiError(error);
  }
}
