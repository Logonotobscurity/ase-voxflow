import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { PlatformError } from '@/lib/domain/errors';

/**
 * Persisted control-node decisions for a run (branch coverage / audit).
 * Returns every condition / router / for_each decision the run recorded,
 * in occurrence order, with the decision value in `result`.
 */
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
    const decisions = await platform.orcflo.listRunDecisions(context, runId);
    return apiSuccess({ decisions, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
