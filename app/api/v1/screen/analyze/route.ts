import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { PlatformError } from '@/lib/domain/errors';
import { apiError, apiSuccess, parseJsonBody } from '@/lib/server/http';

const MAX_IMAGE_BASE64 = 4_500_000;

const ScreenAnalysisRequestSchema = z.object({
  image: z.string().regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/, 'Image must be a base64 data URL.').max(MAX_IMAGE_BASE64),
  question: z.string().trim().max(1_000).optional(),
}).strict();

const ScreenAnalysisSchema = z.object({
  summary: z.string(),
  context: z.string(),
  observations: z.array(z.string()).max(8),
  automationOpportunities: z.array(z.object({ title: z.string(), detail: z.string() })).max(5),
  answer: z.string().nullable().optional(),
});

const SYSTEM_PROMPT = `You analyse screenshots for Ase VOXFLOW, a governed workflow-automation platform for African businesses.
Describe what is visible on the screen, identify the application or task context, and suggest concrete workflow-automation opportunities a team could model in VOXFLOW.
Never invent text that is not visible. If the screen contains credentials, personal identifiers or financial account numbers, mention that sensitive data is visible without repeating it.
Respond ONLY with JSON matching: {"summary": string, "context": string, "observations": string[], "automationOpportunities": [{"title": string, "detail": string}], "answer": string | null}.
Keep observations to at most 6 short items and opportunities to at most 3. "answer" responds to the user's question, or null when no question was asked.`;

const anthropic = new Anthropic();

/** Analyses a single user-provided screenshot with a vision model. Images are not stored. */
export async function POST(request: Request) {
  try {
    const input = ScreenAnalysisRequestSchema.parse(await parseJsonBody(request));
    const [, mediaType, data] = /^data:(image\/[a-z]+);base64,(.+)$/.exec(input.image) ?? [];

    let message: Anthropic.Message;
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 1_200,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/png', data } },
            { type: 'text', text: input.question ? `Question: ${input.question}` : 'Analyse this screen.' },
          ],
        }],
      });
    } catch (cause) {
      throw new PlatformError('PROVIDER_ERROR', 'The vision provider could not analyse this screen.', { retryable: true, cause });
    }

    const text = message.content.flatMap((block) => block.type === 'text' ? [block.text] : []).join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    let analysis: z.infer<typeof ScreenAnalysisSchema>;
    try {
      analysis = ScreenAnalysisSchema.parse(JSON.parse(json));
    } catch (cause) {
      throw new PlatformError('PROVIDER_ERROR', 'The vision provider returned an unreadable analysis.', { retryable: true, cause });
    }

    return apiSuccess({ ...analysis, model: message.model, analysedAt: new Date().toISOString() });
  } catch (error) {
    return apiError(error);
  }
}
