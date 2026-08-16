import type { NextRequest } from 'next/server';
import { PlatformError } from '../domain/errors';
import { createId } from '../domain/events';
import type { ActorContext } from '../domain/policy';
import { getPlatform } from './platform';
import { reconcileActorContext } from '../infrastructure/identity-verifiers';

/**
 * Audit §1 — Request context resolution.
 *
 * This function used to read spoofable headers (`x-ase-tenant-id`,
 * `x-ase-actor-id`, `x-ase-role`) in any runtime mode. The audit
 * found that the only thing stopping a request from one tenant
 * reaching another tenant's data was the header string itself.
 *
 * The new flow:
 *   1. The platform composition root wires an `IdentityVerifier` and
 *      a `TenantMembershipRepository` according to `ASE_RUNTIME_MODE`.
 *   2. The verifier either returns a `VerifiedIdentity` or throws
 *      `AUTHENTICATION_REQUIRED`. There is no fallback to "trust the
 *      headers if no token is present."
 *   3. The verified identity is reconciled against the membership
 *      authority. A role mismatch is `AUTHORIZATION_DENIED`; a missing
 *      membership is `AUTHENTICATION_REQUIRED`.
 *   4. The result is the same `ActorContext` shape the rest of the
 *      platform already consumes.
 *
 * The bypass env var `ASE_IDENTITY_BYPASS=1` exists ONLY for local
 * debugging and is refused in any non-demo runtime mode. The
 * deployment secret store must not set it.
 */
export async function getRequestContext(request: NextRequest): Promise<ActorContext> {
  const correlationId = request.headers.get('x-correlation-id') ?? createId('corr');
  const platform = getPlatform();
  const verifier = platform.ports.identity;
  if (!verifier) {
    throw new PlatformError(
      'CONFIGURATION_ERROR',
      'No IdentityVerifier is wired. The platform cannot authenticate requests.',
    );
  }
  const identity = await verifier.verify({ headers: request.headers });
  return reconcileActorContext(identity, platform.ports.tenantMembers, correlationId);
}
