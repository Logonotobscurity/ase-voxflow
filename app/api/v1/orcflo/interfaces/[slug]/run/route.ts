import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { apiError, apiSuccess } from '@/lib/server/http';

/**
 * §34 — public interface invocation. Deliberately anonymous: this route
 * does NOT call getRequestContext (there is no caller identity to
 * verify). Abuse controls (rate limits, run caps, cost/duration bounds,
 * input validation, idempotency) live in the service and apply before
 * any workflow run starts.
 */
const PublicRunSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = PublicRunSchema.parse(body);
    const platform = getPlatform();
    // §34 hardening — best-effort caller IP for per-IP limiting. Derived
    // from proxy headers only; absent in direct connections.
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || undefined;
    const run = await platform.publicInterfaces.runPublic(slug, parsed, { ip });
    return apiSuccess({ run, persistence: platform.persistence }, 202);
  } catch (error) {
    return apiError(error);
  }
}
