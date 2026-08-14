import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { apiError, apiSuccess, parseJsonBody } from '@/lib/server/http';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';

const VoiceCommandRequestSchema = z.object({
  transcript: z.string().trim().min(1).max(4_000),
  workflowId: z.string().trim().min(1).max(128).optional(),
}).strict();

/** Compatibility endpoint for already-transcribed voice input. No media is accepted here. */
export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const input = VoiceCommandRequestSchema.parse(await parseJsonBody(request));
    const platform = getPlatform();
    const proposal = await platform.commands.propose({
      text: input.transcript,
      modality: 'VOICE_TRANSCRIPT',
      workflowId: input.workflowId,
      context,
    });
    return apiSuccess({
      ...proposal,
      persistence: platform.persistence,
      compatibilityEndpoint: true,
    }, 202);
  } catch (error) {
    return apiError(error);
  }
}
