import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { BlueprintParameterSchema } from '@/lib/domain/orcflo';
import { MetadataSchema, WorkflowEdgeSchema, WorkflowNodeSchema } from '@/lib/domain/schemas';

const CreateBlueprintSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1_000).default(''),
  parameters: z.array(BlueprintParameterSchema).max(50).default([]),
  nodes: z.array(WorkflowNodeSchema).min(1).max(500),
  edges: z.array(WorkflowEdgeSchema).max(2_000).default([]),
  metadata: MetadataSchema,
}).strict();

export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const platform = getPlatform();
    const blueprints = await platform.blueprints.list(context);
    return apiSuccess({ blueprints, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const body = await request.json().catch(() => ({}));
    const input = CreateBlueprintSchema.parse(body);
    const platform = getPlatform();
    const blueprint = await platform.blueprints.createFromGraph(context, input);
    return apiSuccess({ blueprint, persistence: platform.persistence }, 201);
  } catch (error) {
    return apiError(error);
  }
}
