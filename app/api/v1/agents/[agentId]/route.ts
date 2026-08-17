import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { roleAllows } from '@/lib/domain/policy';
import { PlatformError } from '@/lib/domain/errors';

/**
 * Agent detail — the Agent Runtime read surface (tenant-scoped).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    if (!roleAllows(context.role, 'agent:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read agents.`);
    }
    const { agentId } = await params;
    const platform = getPlatform();
    const agent = await platform.ports.agents.findById(context.tenantId, agentId);
    if (!agent) throw new PlatformError('NOT_FOUND', `Agent ${agentId} was not found.`);
    return apiSuccess({ agent, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
