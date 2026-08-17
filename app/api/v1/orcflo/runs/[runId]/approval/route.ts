import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

/**
 * §49 resumable approval — decide a run paused at WAITING_APPROVAL.
 * APPROVED resumes execution from the approval node; REJECTED cancels
 * the run. The decision is persisted system state, never a frontend-only
 * boolean, and requires the approval:decide permission (APPROVER+).
 */
const ApprovalSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().max(2_000).optional(),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { runId } = await params;
    const body = await request.json().catch(() => ({}));
    const input = ApprovalSchema.parse(body);
    const platform = getPlatform();
    const run = await platform.orcflo.decideApproval(context, runId, input.decision, input.reason);
    return apiSuccess({ run, persistence: platform.persistence }, 200);
  } catch (error) {
    return apiError(error);
  }
}
