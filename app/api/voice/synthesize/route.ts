import { NextResponse } from 'next/server';
import { z } from 'zod';

const SynthesisRequestSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  voice: z.string().trim().min(1).max(100).optional(),
  language: z.string().trim().min(2).max(35).optional(),
}).strict();

export async function POST(request: Request) {
  const parsed = SynthesisRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A valid synthesis request is required.',
        retryable: false,
        details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    }, { status: 422 });
  }

  return NextResponse.json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'No speech synthesis provider is connected. No audio was generated or queued.',
      retryable: false,
    },
  }, { status: 501 });
}
