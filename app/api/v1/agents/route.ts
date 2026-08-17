import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getPlatform } from '@/lib/server/platform';
import { getRequestContext } from '@/lib/server/request-context';
import { apiError, apiSuccess } from '@/lib/server/http';
import { createId } from '@/lib/domain/events';
import { roleAllows } from '@/lib/domain/policy';
import { PlatformError } from '@/lib/domain/errors';
import {
  AgentPoliciesSchema,
  AgentSchema,
  MetadataSchema,
} from '@/lib/domain/schemas';

/**
 * Agent domain API (ROUTE_ARCHITECTURE_SPEC §39 / Route → Domain
 * Ownership: /api/v1/agents → Agent Runtime). Create + list are the
 * surfaces Wave 2 consumes; the canonical AgentSchema is the contract.
 */
const CreateAgentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(500),
  role: z.string().trim().min(2).max(100),
  goals: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  instructions: z.string().trim().min(1).max(10_000),
  toolIds: z.array(z.string().min(1).max(200)).max(50).default([]),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  permissions: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  policies: AgentPoliciesSchema.default({}),
  metadata: MetadataSchema,
}).strict();

export async function GET(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    if (!roleAllows(context.role, 'agent:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read agents.`);
    }
    const platform = getPlatform();
    const agents = await platform.ports.agents.list(context.tenantId);
    return apiSuccess({ agents, persistence: platform.persistence });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getRequestContext(request);
    if (!roleAllows(context.role, 'agent:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot create agents.`);
    }
    const input = CreateAgentSchema.parse(await request.json().catch(() => ({})));
    const platform = getPlatform();
    const now = new Date().toISOString();
    const agent = AgentSchema.parse({
      ...input,
      id: createId('agent'),
      tenantId: context.tenantId,
      status: 'REGISTERED',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await platform.ports.agents.save(agent);
    return apiSuccess({ agent, persistence: platform.persistence }, 201);
  } catch (error) {
    return apiError(error);
  }
}
