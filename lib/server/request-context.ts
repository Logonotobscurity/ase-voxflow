import type { NextRequest } from 'next/server';
import { TenantRoleSchema } from '../domain/schemas';
import { PlatformError } from '../domain/errors';
import { createId } from '../domain/events';
import type { ActorContext } from '../domain/policy';

const EnvironmentValues = ['demo', 'development', 'staging', 'production'] as const;

export function getRequestContext(request: NextRequest): ActorContext {
  const runtimeMode = process.env.ASE_RUNTIME_MODE ?? 'demo';
  if (runtimeMode !== 'demo') {
    throw new PlatformError(
      'CONFIGURATION_ERROR',
      'Production identity verification is not configured. Refusing spoofable header authentication.',
    );
  }
  const environmentHeader = request.headers.get('x-ase-environment') ?? 'demo';
  const environment = EnvironmentValues.includes(environmentHeader as (typeof EnvironmentValues)[number])
    ? environmentHeader as ActorContext['environment']
    : 'demo';
  return {
    tenantId: request.headers.get('x-ase-tenant-id') ?? 'tenant_demo',
    actorId: request.headers.get('x-ase-actor-id') ?? 'actor_ada',
    role: TenantRoleSchema.parse(request.headers.get('x-ase-role') ?? 'BUILDER'),
    correlationId: request.headers.get('x-correlation-id') ?? createId('corr'),
    environment,
  };
}
