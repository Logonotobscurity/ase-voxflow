import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { ToolRiskSchema } from '@/lib/domain/schemas';

const ToolRegisterSchema = z.object({
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  description: z.string().trim().max(500).optional(),
  riskLevel: ToolRiskSchema.optional(),
  timeoutMs: z.number().int().min(50).max(300_000).optional(),
}).strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { workflowId } = await params;
    const platform = getPlatform();
    const tool = await platform.workflowTools.describe(context, workflowId);
    return apiSuccess({ tool, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { workflowId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = ToolRegisterSchema.parse(body);
    const platform = getPlatform();
    const tool = await platform.workflowTools.register(context, workflowId, input);
    return apiSuccess({ tool, persistence: platform.persistence }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { workflowId } = await params;
    const platform = getPlatform();
    const tool = await platform.workflowTools.unregister(context, workflowId);
    return apiSuccess({ tool, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
