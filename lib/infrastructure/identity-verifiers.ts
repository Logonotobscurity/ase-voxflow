/**
 * Audit §1 — Identity verifiers.
 *
 * The platform used to read spoofable request headers in any runtime
 * mode. The audit found that the *only* thing stopping one tenant from
 * reaching another tenant's data was the header string itself.
 *
 * Two verifiers ship in this increment. Both are deliberately strict:
 * a verifier either returns a `VerifiedIdentity` or throws
 * `PlatformError('AUTHENTICATION_REQUIRED')`. There is no "default to
 * the headers if no token is present" path.
 *
 * The composition root picks one based on `ASE_RUNTIME_MODE` and
 * `ASE_IDENTITY_VERIFIER`. The demo verifier is ONLY active in demo
 * mode; the bearer verifier is the only path for staging/production
 * until a real SSO/identity-provider verifier is shipped.
 */
import 'server-only';
import { PlatformError } from '../domain/errors';
import type {
  IdentityVerifier,
  TenantMembershipRepository,
  VerifiedIdentity,
} from '../application/ports';
import { TenantRoleSchema, type TenantRole } from '../domain/schemas';
import type { ActorContext } from '../domain/policy';

const EnvironmentValues = ['demo', 'development', 'staging', 'production'] as const;
type Environment = (typeof EnvironmentValues)[number];

/**
 * Demo verifier.
 *
 * Only active when `ASE_RUNTIME_MODE === 'demo'`. Reads the spoofable
 * headers that the legacy code path used to read in any mode. The
 * `IdentityVerifier` contract guarantees that this verifier is the
 * one wired by `getPlatform()` ONLY in demo mode.
 */
export class DemoHeaderIdentityVerifier implements IdentityVerifier {
  async verify(request: { headers: Headers }): Promise<VerifiedIdentity> {
    if (process.env.ASE_RUNTIME_MODE !== 'demo') {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'DemoHeaderIdentityVerifier is only active in ASE_RUNTIME_MODE=demo. Refusing to verify.',
      );
    }
    const headers = request.headers;
    const actorId = headers.get('x-ase-actor-id') ?? 'actor_ada';
    const claimedTenantId = headers.get('x-ase-tenant-id') ?? 'tenant_demo';
    const claimedRole = TenantRoleSchema.parse(headers.get('x-ase-role') ?? 'BUILDER');
    const envHeader = headers.get('x-ase-environment') ?? 'demo';
    const claimedEnvironment: Environment = (EnvironmentValues as readonly string[]).includes(envHeader)
      ? (envHeader as Environment)
      : 'demo';
    return {
      kind: 'demo',
      subject: `demo:${actorId}`,
      actorId,
      claimedTenantId,
      claimedRole,
      claimedEnvironment,
    };
  }
}

/**
 * Bearer-token verifier for staging and production.
 *
 * Compares the `Authorization: Bearer ...` header to a single shared
 * secret read from `ASE_PROD_BEARER_TOKEN`. The secret is expected
 * to be rotated via the deployment secret store; this verifier does
 * not store it.
 *
 * This is intentionally minimal: a deploy token, not a per-user
 * identity. The audit's P0 owner for trusted SSO is the Platform
 * Security Owner (see `docs/ARCHITECTURE.md` §3); this verifier
 * exists so the platform can boot in a non-demo environment
 * WITHOUT reverting to spoofable headers.
 */
export class BearerTokenIdentityVerifier implements IdentityVerifier {
  constructor(private readonly expectedToken: string) {
    if (!expectedToken || expectedToken.length < 16) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'ASE_PROD_BEARER_TOKEN must be set to a non-trivial value (>= 16 chars) for staging/production deploys.',
      );
    }
  }

  async verify(request: { headers: Headers }): Promise<VerifiedIdentity> {
    // Defense in depth: the composition root picks this verifier only
    // when `ASE_RUNTIME_MODE !== 'demo'`. A misconfigured deploy that
    // leaves the runtime in demo mode would otherwise fall back to
    // the spoofable-header path. The verifier itself refuses to
    // verify in demo mode so a runtime misconfiguration cannot
    // silently re-open the audit §1 attack surface.
    if (process.env.ASE_RUNTIME_MODE === 'demo') {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'BearerTokenIdentityVerifier refuses to verify in ASE_RUNTIME_MODE=demo. ' +
        'The demo verifier is the only one allowed in demo mode.',
      );
    }
    const header = request.headers.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      throw new PlatformError(
        'AUTHENTICATION_REQUIRED',
        'Missing or malformed Authorization header. A deploy bearer token is required.',
      );
    }
    const presented = match[1].trim();
    // Constant-time comparison.
    if (!constantTimeEqual(presented, this.expectedToken)) {
      throw new PlatformError(
        'AUTHENTICATION_REQUIRED',
        'Bearer token did not match the configured deploy token.',
      );
    }
    // The bearer token identifies a deploy principal, not a user. The
    // tenant/role are taken from explicit headers, but only after the
    // bearer check succeeds; this is the same surface the demo verifier
    // uses, just gated by token.
    const actorId = request.headers.get('x-ase-actor-id') ?? 'actor_deploy';
    const claimedTenantId = request.headers.get('x-ase-tenant-id') ?? 'tenant_default';
    const claimedRole = TenantRoleSchema.parse(request.headers.get('x-ase-role') ?? 'ADMIN');
    const envHeader = request.headers.get('x-ase-environment') ?? 'production';
    const claimedEnvironment: Environment = (EnvironmentValues as readonly string[]).includes(envHeader)
      ? (envHeader as Environment)
      : 'production';
    return {
      kind: 'bearer',
      subject: `bearer:${actorId}`,
      actorId,
      claimedTenantId,
      claimedRole,
      claimedEnvironment,
    };
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Reconcile a verified identity with the tenant membership authority.
 *
 * Returns a fully populated `ActorContext` (the shape the rest of the
 * platform consumes) or throws:
 *   - `AUTHENTICATION_REQUIRED` if no membership is found
 *   - `AUTHORIZATION_DENIED` if the membership role differs from the
 *     verifier's claim (e.g. spoofed role header)
 *
 * In demo mode, if no membership repository is wired, the demo tenant
 * is bootstrapped with the verifier's claimed role and the call
 * succeeds. This preserves the existing demo flow without leaving a
 * permanent bypass in the production code path.
 */
export async function reconcileActorContext(
  identity: VerifiedIdentity,
  memberships: TenantMembershipRepository | undefined,
  correlationId: string,
): Promise<ActorContext> {
  if (!memberships) {
    if (process.env.ASE_RUNTIME_MODE !== 'demo') {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'A TenantMembershipRepository is required for any non-demo runtime.',
      );
    }
    // Demo bootstrap: trust the verifier.
    return {
      tenantId: identity.claimedTenantId,
      actorId: identity.actorId,
      role: identity.claimedRole,
      correlationId,
      environment: identity.claimedEnvironment,
    };
  }
  const found = await memberships.find(identity.claimedTenantId, identity.actorId);
  if (!found) {
    throw new PlatformError(
      'AUTHENTICATION_REQUIRED',
      `Actor ${identity.actorId} has no membership in tenant ${identity.claimedTenantId}.`,
    );
  }
  if (found.role !== identity.claimedRole) {
    throw new PlatformError(
      'AUTHORIZATION_DENIED',
      `Role mismatch: identity claims ${identity.claimedRole} but membership grants ${found.role}.`,
    );
  }
  return {
    tenantId: found.tenantId,
    actorId: found.actorId,
    role: found.role as TenantRole,
    correlationId,
    environment: identity.claimedEnvironment,
  };
}
