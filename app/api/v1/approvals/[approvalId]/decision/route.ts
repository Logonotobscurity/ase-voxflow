import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';

const ApprovalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().min(3).max(2_000),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  try {
    const context = await getRequestContext(request);
    const { approvalId } = await params;
    const input = ApprovalDecisionSchema.parse(await request.json());
    const platform = getPlatform();
    const result = await platform.transactions.decide({ approvalId, ...input, context });
    return apiSuccess({ ...result, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}
