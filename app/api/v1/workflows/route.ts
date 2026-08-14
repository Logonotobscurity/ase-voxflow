import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { createId } from '@/lib/domain/events';
import { roleAllows } from '@/lib/domain/policy';
import { PlatformError } from '@/lib/domain/errors';
import {
  MetadataSchema,
  WorkflowEdgeSchema,
  WorkflowNodeSchema,
  WorkflowSchema,
  WorkflowStatusSchema,
} from '@/lib/domain/schemas';
import { validateWorkflowGraph } from '@/lib/domain/workflow-graph';

const SaveWorkflowSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(2_000).default(''),
  status: WorkflowStatusSchema.default('DRAFT'),
  version: z.number().int().positive().default(1),
  nodes: z.array(WorkflowNodeSchema).max(250),
  edges: z.array(WorkflowEdgeSchema).max(1_000),
  metadata: MetadataSchema,
}).strict();

export async function GET(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const platform = getPlatform();
    const workflows = await platform.ports.workflows.list(context.tenantId);
    return apiSuccess({ workflows, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot save workflows.`);
    }
    const input = SaveWorkflowSchema.parse(await request.json());
    validateWorkflowGraph(input);
    const platform = getPlatform();
    const id = input.id ?? createId('workflow');
    const existing = await platform.ports.workflows.findById(context.tenantId, id);
    const now = new Date().toISOString();
    const workflow = WorkflowSchema.parse({
      ...input,
      id,
      tenantId: context.tenantId,
      version: existing ? existing.version + 1 : input.version,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await platform.ports.workflows.save(workflow);
    return apiSuccess({ workflow, persistence: platform.persistence }, existing ? 200 : 201);
  } catch (error) {
    return apiError(error);
  }
}
