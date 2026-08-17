import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { roleAllows } from '@/lib/domain/policy';
import { PlatformError } from '@/lib/domain/errors';

/**
 * Tool domain API (ROUTE_ARCHITECTURE_SPEC §39 / Route → Domain
 * Ownership: /api/v1/tools → Tool Layer). Lists the canonical tool
 * registry for the tenant — the same ToolDefinition records agents and
 * workflows resolve through the shared tool executor.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    if (!roleAllows(context.role, 'tool:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read tools.`);
    }
    const platform = getPlatform();
    const tools = await platform.ports.tools.list(context.tenantId);
    return apiSuccess({ tools, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
