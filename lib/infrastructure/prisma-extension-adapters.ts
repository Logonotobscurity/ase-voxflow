/**
 * Capability 04 / 06 — Prisma-backed extension repositories.
 *
 * IMPORTANT: this module is wired into the composition root only when
 * `ASE_PERSISTENCE_MODE=postgres`. It depends on the regenerated
 * Prisma client (`app/generated/prisma/client`) which exposes the
 * `Transcript` and `McpServer` models added in migration
 * `20260816120000_capability_extension`.
 *
 * The memory-mode composition path does NOT import this module, so
 * demo / CI runs without `prisma generate` are unaffected.
 *
 * After regenerating the Prisma client, this module will compile and
 * can be imported by `lib/server/platform.ts` for the postgres branch.
 */
import 'server-only';
import type { PrismaClient } from '../../app/generated/prisma/client';
import type { McpServerConfig, Transcript } from '../domain/schemas';
import { McpServerConfigSchema, TranscriptSchema } from '../domain/schemas';
import type { McpServerRegistry, TranscriptRepository } from '../application/ports';
import { PlatformError } from '../domain/errors';

export class PrismaTranscriptRepository implements TranscriptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(transcript: Transcript): Promise<void> {
    await this.prisma.transcript.create({ data: this.toRow(transcript) });
  }

  async listBySession(tenantId: string, sessionId: string, limit = 100): Promise<Transcript[]> {
    const rows = await this.prisma.transcript.findMany({
      where: { tenantId, sessionId },
      orderBy: { occurredAt: 'asc' },
      take: Math.max(1, Math.min(Math.trunc(limit), 1_000)),
    });
    return rows.map((row) => this.fromRow(row));
  }

  async listByParticipant(tenantId: string, participantId: string, limit = 100): Promise<Transcript[]> {
    const rows = await this.prisma.transcript.findMany({
      where: { tenantId, participantId },
      orderBy: { occurredAt: 'asc' },
      take: Math.max(1, Math.min(Math.trunc(limit), 1_000)),
    });
    return rows.map((row) => this.fromRow(row));
  }

  private toRow(t: Transcript) {
    return {
      id: t.id,
      tenantId: t.tenantId,
      sessionId: t.sessionId,
      participantId: t.participantId,
      occurredAt: new Date(t.occurredAt),
      language: t.language,
      text: t.text,
      confidence: t.confidence,
      final: t.final,
      intent: t.intent,
      riskLevel: t.riskLevel,
      requiresConfirmation: t.requiresConfirmation,
      commandId: t.commandId,
      metadata: t.metadata as object,
    };
  }

  private fromRow(row: {
    id: string;
    tenantId: string;
    sessionId: string;
    participantId: string;
    occurredAt: Date;
    language: string;
    text: string;
    confidence: number;
    final: boolean;
    intent: string | null;
    riskLevel: string | null;
    requiresConfirmation: boolean | null;
    commandId: string | null;
    metadata: unknown;
  }): Transcript {
    return TranscriptSchema.parse({
      id: row.id,
      tenantId: row.tenantId,
      sessionId: row.sessionId,
      participantId: row.participantId,
      occurredAt: row.occurredAt.toISOString(),
      language: row.language,
      text: row.text,
      confidence: row.confidence,
      final: row.final,
      intent: row.intent ?? undefined,
      riskLevel: row.riskLevel ?? undefined,
      requiresConfirmation: row.requiresConfirmation ?? undefined,
      commandId: row.commandId ?? undefined,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    });
  }
}

export class PrismaMcpServerRegistry implements McpServerRegistry {
  constructor(private readonly prisma: PrismaClient) {}

  async listAllowedServers(tenantId: string): Promise<McpServerConfig[]> {
    const rows = await this.prisma.mcpServer.findMany({
      where: { tenantId, trusted: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.fromRow(row));
  }

  async getServer(tenantId: string, serverId: string): Promise<McpServerConfig | null> {
    const row = await this.prisma.mcpServer.findFirst({ where: { id: serverId, tenantId } });
    return row ? this.fromRow(row) : null;
  }

  private fromRow(row: {
    id: string;
    tenantId: string;
    name: string;
    transport: string;
    endpoint: string;
    identityRef: string;
    allowedTools: unknown;
    trusted: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): McpServerConfig {
    if (!['stdio', 'http_sse', 'streamable_http'].includes(row.transport)) {
      throw new PlatformError('VALIDATION_ERROR', `Unknown MCP transport: ${row.transport}.`);
    }
    return McpServerConfigSchema.parse({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      transport: row.transport,
      endpoint: row.endpoint,
      identityRef: row.identityRef,
      allowedTools: (row.allowedTools as string[]) ?? [],
      trusted: row.trusted,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
