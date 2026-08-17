import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { PlatformError } from '@/lib/domain/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { runId } = await params;
    const platform = getPlatform();
    const run = await platform.orcflo.getRun(context, runId);
    if (!run) throw new PlatformError('NOT_FOUND', `Run ${runId} was not found.`);
    return apiSuccess({ run, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
