import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PlatformError, asPlatformError } from '../domain/errors';

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (cause) {
    throw new PlatformError('VALIDATION_ERROR', 'Request body must be valid JSON.', { cause });
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        retryable: false,
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    }, { status: 422 });
  }
  const failure = error instanceof PlatformError ? error : asPlatformError(error);
  if (!(error instanceof PlatformError)) console.error(error);
  return NextResponse.json({
    error: {
      code: failure.code,
      message: failure.message,
      retryable: failure.retryable,
      metadata: failure.safeMetadata,
    },
  }, { status: failure.status });
}
