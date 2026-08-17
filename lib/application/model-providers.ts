import { PlatformError } from '../domain/errors';
import { createId } from '../domain/events';
import type { ModelCallInput, ModelProviderGateway } from './ports';
import type { ModelCallResult, OrcfloModelProvider } from '../domain/orcflo';

/**
 * Fail-closed model provider gateways.
 *
 * No gateway ever contacts an external service. The platform has no
 * verified LLM SDK, so:
 *
 *   - `NoopModelProviderGateway` refuses every call (default in any
 *     non-demo runtime mode).
 *   - `DemoModelProviderGateway` answers only providers with
 *     `kind === 'demo'` with a deterministic echo, and refuses
 *     `noop` and `external` kinds. `external` providers exist as
 *     configuration placeholders for a future reviewed SDK; calling
 *     them today is a `PROVIDER_ERROR`, never a fabricated response.
 *
 * The engine records metering for every accepted call; failed calls
 * are metered as `model.failed`.
 */
export class NoopModelProviderGateway implements ModelProviderGateway {
  async call(_provider: OrcfloModelProvider, input: ModelCallInput): Promise<ModelCallResult> {
    throw new PlatformError(
      'PROVIDER_ERROR',
      'No model provider is configured. The no-op gateway refuses every model call.',
      { safeMetadata: { providerId: input.providerId } },
    );
  }
}

export class DemoModelProviderGateway implements ModelProviderGateway {
  async call(provider: OrcfloModelProvider, input: ModelCallInput): Promise<ModelCallResult> {
    if (provider.kind !== 'demo') {
      throw new PlatformError(
        'PROVIDER_ERROR',
        provider.kind === 'external'
          ? `Model provider "${provider.name}" is external. No verified SDK is wired; the demo gateway refuses external calls.`
          : `Model provider "${provider.name}" is a no-op and cannot be called.`,
        { safeMetadata: { providerId: input.providerId, kind: provider.kind } },
      );
    }
    const now = new Date().toISOString();
    const preview = input.prompt.slice(0, 120);
    const text = `Demo model "${provider.name}" (${provider.model ?? 'unspecified model'}) deterministic response to: ${preview}`;
    return {
      id: createId('modelcall'),
      tenantId: input.tenantId,
      providerId: provider.id,
      status: 'COMPLETED',
      text,
      tokensIn: Math.max(1, Math.ceil(input.prompt.length / 4)),
      tokensOut: Math.min(input.maxTokens, Math.max(1, Math.ceil(text.length / 4))),
      durationMs: 0,
      createdAt: now,
    };
  }
}
