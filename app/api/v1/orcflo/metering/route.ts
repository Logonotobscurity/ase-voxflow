import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    const since = request.nextUrl.searchParams.get('since') ?? undefined;
    const platform = getPlatform();
    const summary = await platform.orcflo.meteringSummary(context, since ?? undefined);
    return apiSuccess({ summary, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
