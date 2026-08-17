import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { roleAllows } from '@/lib/domain/policy';
import { PlatformError } from '@/lib/domain/errors';

/**
 * Team members API (ROUTE_ARCHITECTURE_SPEC §35). The tenant membership
 * authority is the source of truth (Audit §1) — the same records
 * request reconciliation checks. In demo/memory mode this returns the
 * seeded demo members.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read team members.`);
    }
    const platform = getPlatform();
    const members = platform.ports.tenantMembers
      ? await platform.ports.tenantMembers.listForTenant(context.tenantId)
      : [];
    return apiSuccess({ members, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
