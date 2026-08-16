/**
 * Capability 10 — No-op avatar session adapter.
 *
 * Capability 06 — Empty MCP server registry.
 *
 * Both are wired by default in `lib/server/platform.ts` so the platform
 * can boot in demo/memory mode without any provider. They are explicit
 * fail-closed defaults: the `mcp` workflow-node policy already denies
 * untrusted servers, and the no-op avatar lets the canvas render an
 * "avatar not configured" state without coupling to any vendor.
 *
 * No external dependency is introduced.
 */
import type { McpServerConfig } from '../domain/schemas';
import type { AvatarSessionAdapter, AvatarSessionRef, McpServerRegistry } from '../application/ports';
import { PlatformError } from '../domain/errors';
import { createId } from '../domain/events';

export class EmptyMcpServerRegistry implements McpServerRegistry {
  async listAllowedServers(_tenantId: string): Promise<McpServerConfig[]> {
    return [];
  }
  async getServer(_tenantId: string, _serverId: string): Promise<McpServerConfig | null> {
    return null;
  }
}

export class NoopAvatarSessionAdapter implements AvatarSessionAdapter {
  async createSession(tenantId: string, participantId: string): Promise<AvatarSessionRef> {
    throw new PlatformError(
      'CONFIGURATION_ERROR',
      'Avatar session creation is not configured. Install an AvatarProvider adapter to enable avatars.',
      { safeMetadata: { tenantId, participantId } },
    );
  }
  async send(_ref: AvatarSessionRef, _payload: unknown): Promise<void> {
    throw new PlatformError('CONFIGURATION_ERROR', 'Avatar provider is not configured.');
  }
  async terminate(_ref: AvatarSessionRef): Promise<void> {
    // terminating a non-existent session is a no-op by design
    return;
  }
}

/** Helper for tests / dev: a deterministic avatar ref. */
export function buildDevAvatarRef(tenantId: string, participantId: string): AvatarSessionRef {
  return {
    provider: 'none',
    sessionId: createId('avatar_dev'),
    tenantId,
    participantId,
    createdAt: new Date().toISOString(),
  } as AvatarSessionRef;
}
