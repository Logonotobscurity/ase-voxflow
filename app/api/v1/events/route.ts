import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { roleAllows } from '@/lib/domain/policy';
import { PlatformError } from '@/lib/domain/errors';

/**
 * Audit trail API (ROUTE_ARCHITECTURE_SPEC §36 / §39: /events → Event
 * Infrastructure). Returns the tenant's authoritative domain events in
 * reverse-chronological order — the same envelope the transactional
 * outbox publishes, never a UI-owned copy.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read events.`);
    }
    const limitRaw = request.nextUrl.searchParams.get('limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 200;
    const platform = getPlatform();
    const events = await platform.ports.events.listByTenant(context.tenantId, { limit });
    return apiSuccess({ events, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
