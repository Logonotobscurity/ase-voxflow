import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

/**
 * Raw metering records — the per-metric breakdown /app/usage consumes
 * (analytics derived from metering records, never unrelated counters).
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const since = request.nextUrl.searchParams.get('since') ?? undefined;
    const limitRaw = request.nextUrl.searchParams.get('limit');
    const platform = getPlatform();
    const records = await platform.orcflo.listMeteringRecords(context, {
      since: since ?? undefined,
      limit: limitRaw ? Number.parseInt(limitRaw, 10) : undefined,
    });
    return apiSuccess({ records, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
