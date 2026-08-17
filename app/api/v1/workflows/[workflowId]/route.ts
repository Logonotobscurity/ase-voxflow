import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { PlatformError } from '@/lib/domain/errors';

/**
 * Workflow detail — the domain read API the /app/workflows/[workflowId]
 * surface consumes (Route → Domain Ownership: this is Workflow Domain
 * data, exposed through the canonical workflow repository, never a
 * frontend-owned copy).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { workflowId } = await params;
    const platform = getPlatform();
    const workflow = await platform.ports.workflows.findById(context.tenantId, workflowId);
    if (!workflow) throw new PlatformError('NOT_FOUND', `Workflow ${workflowId} was not found.`);
    return apiSuccess({ workflow, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
