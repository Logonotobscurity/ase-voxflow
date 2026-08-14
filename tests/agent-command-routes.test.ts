import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let postAgentCommand: typeof import('../app/api/v1/agent/commands/route').POST;
let postVoiceCommand: typeof import('../app/api/v1/voice/commands/route').POST;

beforeAll(async () => {
  process.env.ASE_RUNTIME_MODE = 'demo';
  process.env.ASE_PERSISTENCE_MODE = 'memory';
  ({ POST: postAgentCommand } = await import('../app/api/v1/agent/commands/route'));
  ({ POST: postVoiceCommand } = await import('../app/api/v1/voice/commands/route'));
});

function request(path: string, body: string, role = 'BUILDER', correlationId = 'corr_route_test') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ase-tenant-id': 'tenant_route_test',
      'x-ase-actor-id': 'actor_route_test',
      'x-ase-role': role,
      'x-correlation-id': correlationId,
    },
    body,
  });
}

describe('agent command routes', () => {
  it('accepts canonical text commands and preserves request correlation', async () => {
    const response = await postAgentCommand(request('/api/v1/agent/commands', JSON.stringify({
      text: 'Run this workflow now',
      modality: 'TEXT',
      workflowId: 'workflow_route_test',
    })));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.data).toMatchObject({
      proposalOnly: true,
      persistence: 'ephemeral-memory',
      command: {
        correlationId: 'corr_route_test',
        modality: 'TEXT',
        intent: 'run_workflow',
        status: 'PROPOSED',
        requiresConfirmation: true,
      },
    });
  });

  it('keeps the old voice transcript endpoint as a compatibility adapter', async () => {
    const response = await postVoiceCommand(request('/api/v1/voice/commands', JSON.stringify({
      transcript: 'Add an approval node',
    }), 'BUILDER', 'corr_voice_route_test'));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.data).toMatchObject({
      compatibilityEndpoint: true,
      proposalOnly: true,
      command: {
        correlationId: 'corr_voice_route_test',
        modality: 'VOICE_TRANSCRIPT',
        intent: 'add_node',
      },
    });
  });

  it('returns a stable validation error for malformed JSON', async () => {
    const response = await postAgentCommand(request('/api/v1/agent/commands', '{'));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Request body must be valid JSON.',
      retryable: false,
    });
  });

  it('returns a stable authorization denial for a viewer mutation', async () => {
    const response = await postAgentCommand(request('/api/v1/agent/commands', JSON.stringify({
      text: 'Add an approval node',
    }), 'VIEWER', 'corr_forbidden_route_test'));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatchObject({ code: 'AUTHORIZATION_DENIED', retryable: false });
  });
});
