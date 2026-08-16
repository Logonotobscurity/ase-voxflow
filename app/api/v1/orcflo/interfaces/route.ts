import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { MetadataSchema } from '@/lib/domain/schemas';

const PublicInterfaceSchema = z.object({
  workflowId: z.string().min(1).max(128),
  name: z.string().trim().min(2).max(100),
  config: z.object({
    slug: z.string().regex(/^pub_[a-z0-9_-]{8,64}$/).optional(),
    inputSchema: z.record(z.string(), z.object({
      type: z.enum(['string', 'number', 'boolean', 'json']),
      required: z.boolean().default(true),
      default: z.unknown().optional(),
    }).strict()).optional(),
    rateLimitPerMinute: z.number().int().min(1).max(1_000).optional(),
    maxRunsPerDay: z.number().int().min(1).max(100_000).optional(),
    maxCostMinor: z.number().int().nonnegative().max(100_000_000).optional(),
    maxDurationMs: z.number().int().min(100).max(120_000).optional(),
    environment: z.enum(['demo', 'development', 'staging', 'production']).optional(),
  }).default({}),
  enabled: z.boolean().default(true),
  metadata: MetadataSchema,
}).strict();

export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const platform = getPlatform();
    const interfaces = await platform.publicInterfaces.list(context);
    return apiSuccess({ interfaces, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const body = await request.json().catch(() => ({}));
    const input = PublicInterfaceSchema.parse(body);
    const platform = getPlatform();
    const created = await platform.publicInterfaces.create(context, input);
    return apiSuccess({ interface: created, persistence: platform.persistence }, 201);
  } catch (error) {
    return apiError(error);
  }
}
