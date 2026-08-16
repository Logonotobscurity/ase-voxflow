/**
 * Audit §1 — Identity layer tests.
 *
 * Pins the five guarantees the audit called out:
 *   1. The demo verifier is active only in `ASE_RUNTIME_MODE=demo`.
 *   2. The bearer verifier refuses to verify in demo mode AND refuses
 *      a missing/malformed/short token.
 *   3. The reconciliation layer refuses a missing membership.
 *   4. The reconciliation layer refuses a role-mismatched membership.
 *   5. The bearer verifier's runtime-mode guard is symmetric to the
 *      demo verifier's, so a misconfigured production deploy cannot
 *      fall back to spoofable headers.
 *
 * The bearer verifier's constant-time compare is exercised through the
 * public `verify` surface; we don't reach into the helper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  BearerTokenIdentityVerifier,
  DemoHeaderIdentityVerifier,
  reconcileActorContext,
} from '../lib/infrastructure/identity-verifiers';
import { InMemoryTenantMembershipRepository, InMemoryPlatformStore } from '../lib/infrastructure/memory-adapters';
import { PlatformError } from '../lib/domain/errors';

// Capture all env vars the tests touch so a future test in another
// file that mutated them does not leak into this file's expectations.
const ORIGINAL: Record<string, string | undefined> = {
  ASE_RUNTIME_MODE: process.env.ASE_RUNTIME_MODE,
  ASE_PERSISTENCE_MODE: process.env.ASE_PERSISTENCE_MODE,
  ASE_PROD_BEARER_TOKEN: process.env.ASE_PROD_BEARER_TOKEN,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('DemoHeaderIdentityVerifier', () => {
  beforeEach(() => {
    process.env.ASE_RUNTIME_MODE = 'demo';
  });

  it('verifies in demo mode using the spoofable headers', async () => {
    const verifier = new DemoHeaderIdentityVerifier();
    const identity = await verifier.verify({
      headers: headers({
        'x-ase-actor-id': 'actor_ada',
        'x-ase-tenant-id': 'tenant_demo',
        'x-ase-role': 'BUILDER',
        'x-ase-environment': 'demo',
      }),
    });
    expect(identity.kind).toBe('demo');
    expect(identity.actorId).toBe('actor_ada');
    expect(identity.claimedTenantId).toBe('tenant_demo');
    expect(identity.claimedRole).toBe('BUILDER');
  });

  it('refuses to verify when the runtime mode is not demo', async () => {
    process.env.ASE_RUNTIME_MODE = 'production';
    const verifier = new DemoHeaderIdentityVerifier();
    await expect(verifier.verify({ headers: headers({}) })).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });

  it('defaults to the demo tenant, demo actor, and BUILDER role when headers are missing', async () => {
    const verifier = new DemoHeaderIdentityVerifier();
    const identity = await verifier.verify({ headers: headers({}) });
    expect(identity.actorId).toBe('actor_ada');
    expect(identity.claimedTenantId).toBe('tenant_demo');
    expect(identity.claimedRole).toBe('BUILDER');
    expect(identity.claimedEnvironment).toBe('demo');
  });
});

describe('BearerTokenIdentityVerifier', () => {
  const secret = 'a-very-long-deploy-token-1234567890';

  beforeEach(() => {
    // Bearer verifier is only active in non-demo modes.
    process.env.ASE_RUNTIME_MODE = 'production';
  });

  it('verifies when the bearer token matches the configured secret', async () => {
    const verifier = new BearerTokenIdentityVerifier(secret);
    const identity = await verifier.verify({
      headers: headers({ authorization: `Bearer ${secret}`, 'x-ase-actor-id': 'actor_deploy' }),
    });
    expect(identity.kind).toBe('bearer');
    expect(identity.subject).toBe('bearer:actor_deploy');
    expect(identity.claimedRole).toBe('ADMIN');
  });

  it('refuses a missing Authorization header', async () => {
    const verifier = new BearerTokenIdentityVerifier(secret);
    await expect(verifier.verify({ headers: headers({}) })).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('refuses a malformed Authorization header', async () => {
    const verifier = new BearerTokenIdentityVerifier(secret);
    await expect(verifier.verify({ headers: headers({ authorization: 'Basic abc' }) }))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('refuses a bearer token that does not match the configured secret', async () => {
    const verifier = new BearerTokenIdentityVerifier(secret);
    await expect(verifier.verify({ headers: headers({ authorization: 'Bearer wrong-token-1234567890' }) }))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('refuses to verify when the runtime mode is demo (defense in depth)', async () => {
    process.env.ASE_RUNTIME_MODE = 'demo';
    const verifier = new BearerTokenIdentityVerifier(secret);
    await expect(verifier.verify({ headers: headers({ authorization: `Bearer ${secret}` }) }))
      .rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });

  it('refers to short or empty secrets at construction time', () => {
    expect(() => new BearerTokenIdentityVerifier('')).toThrow(PlatformError);
    expect(() => new BearerTokenIdentityVerifier('short')).toThrow(PlatformError);
  });
});

describe('reconcileActorContext', () => {
  const store = new InMemoryPlatformStore();
  const memberships = new InMemoryTenantMembershipRepository(store);

  it('throws AUTHENTICATION_REQUIRED when there is no membership', async () => {
    process.env.ASE_RUNTIME_MODE = 'demo';
    await expect(
      reconcileActorContext(
        {
          kind: 'demo',
          subject: 'demo:actor_ada',
          actorId: 'actor_ada',
          claimedTenantId: 'tenant_demo',
          claimedRole: 'BUILDER',
          claimedEnvironment: 'demo',
        },
        memberships,
        'corr_1',
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('returns an ActorContext when the membership exists and the role matches', async () => {
    process.env.ASE_RUNTIME_MODE = 'demo';
    await memberships.upsert({ tenantId: 'tenant_demo', actorId: 'actor_ada', role: 'BUILDER' });
    const ctx = await reconcileActorContext(
      {
        kind: 'demo',
        subject: 'demo:actor_ada',
        actorId: 'actor_ada',
        claimedTenantId: 'tenant_demo',
        claimedRole: 'BUILDER',
        claimedEnvironment: 'demo',
      },
      memberships,
      'corr_2',
    );
    expect(ctx).toEqual({
      tenantId: 'tenant_demo',
      actorId: 'actor_ada',
      role: 'BUILDER',
      correlationId: 'corr_2',
      environment: 'demo',
    });
  });

  it('throws AUTHORIZATION_DENIED when the membership role does not match the claim', async () => {
    process.env.ASE_RUNTIME_MODE = 'demo';
    await memberships.upsert({ tenantId: 'tenant_demo', actorId: 'actor_ada', role: 'VIEWER' });
    await expect(
      reconcileActorContext(
        {
          kind: 'demo',
          subject: 'demo:actor_ada',
          actorId: 'actor_ada',
          claimedTenantId: 'tenant_demo',
          claimedRole: 'BUILDER', // mismatch with stored VIEWER
          claimedEnvironment: 'demo',
        },
        memberships,
        'corr_3',
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });

  it('falls back to the demo trust path only when no membership repo is wired AND runtime is demo', async () => {
    process.env.ASE_RUNTIME_MODE = 'demo';
    const ctx = await reconcileActorContext(
      {
        kind: 'demo',
        subject: 'demo:actor_ada',
        actorId: 'actor_ada',
        claimedTenantId: 'tenant_demo',
        claimedRole: 'BUILDER',
        claimedEnvironment: 'demo',
      },
      undefined,
      'corr_4',
    );
    expect(ctx.tenantId).toBe('tenant_demo');
  });

  it('refuses the demo trust path when no membership repo is wired AND runtime is not demo', async () => {
    process.env.ASE_RUNTIME_MODE = 'production';
    await expect(
      reconcileActorContext(
        {
          kind: 'bearer',
          subject: 'bearer:actor_deploy',
          actorId: 'actor_deploy',
          claimedTenantId: 'tenant_default',
          claimedRole: 'ADMIN',
          claimedEnvironment: 'production',
        },
        undefined,
        'corr_5',
      ),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });
});
