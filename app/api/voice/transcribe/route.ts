import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A non-empty audio file is required.',
        retryable: false,
      },
    }, { status: 422 });
  }

  return NextResponse.json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'No speech transcription provider is connected. The uploaded audio was not transcribed.',
      retryable: false,
    },
  }, { status: 501 });
}
