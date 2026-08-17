import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { roleAllows } from '@/lib/domain/policy';
import { PlatformError } from '@/lib/domain/errors';

/**
 * MCP control-plane read API (ROUTE_ARCHITECTURE_SPEC §25 / §39).
 * Returns the tenant's registered MCP servers from the platform's
 * McpServerRegistry. Today the registry is the fail-closed empty
 * implementation (no MCP transport exists), so this honestly returns an
 * empty list — the UI must never become the MCP execution layer.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    if (!roleAllows(context.role, 'tool:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read MCP servers.`);
    }
    const platform = getPlatform();
    const servers = await platform.mcpServers.listAllowedServers(context.tenantId);
    return apiSuccess({ servers, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
