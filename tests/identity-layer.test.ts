/**
 * Audit §1 — Identity layer tests.
 *
 * Pins the four guarantees the audit called out:
 *   1. The demo verifier is active only in `ASE_RUNTIME_MODE=demo`.
 *   2. The bearer verifier refuses to verify a missing/malformed/short token.
 *   3. The reconciliation layer refuses a missing membership.
 *   4. The reconciliation layer refuses a role-mismatched membership.
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

const ORIGINAL_RUNTIME = process.env.ASE_RUNTIME_MODE;

beforeEach(() => {
  process.env.ASE_RUNTIME_MODE = 'demo';
});

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) delete process.env.ASE_RUNTIME_MODE;
  else process.env.ASE_RUNTIME_MODE = ORIGINAL_RUNTIME;
});

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('DemoHeaderIdentityVerifier', () => {
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
  const verifier = new BearerTokenIdentityVerifier(secret);

  it('verifies when the bearer token matches the configured secret', async () => {
    const identity = await verifier.verify({
      headers: headers({ authorization: `Bearer ${secret}`, 'x-ase-actor-id': 'actor_deploy' }),
    });
    expect(identity.kind).toBe('bearer');
    expect(identity.subject).toBe('bearer:actor_deploy');
    expect(identity.claimedRole).toBe('ADMIN');
  });

  it('refuses a missing Authorization header', async () => {
    await expect(verifier.verify({ headers: headers({}) })).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('refuses a malformed Authorization header', async () => {
    await expect(verifier.verify({ headers: headers({ authorization: 'Basic abc' }) }))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('refuses a bearer token that does not match the configured secret', async () => {
    await expect(verifier.verify({ headers: headers({ authorization: 'Bearer wrong-token-1234567890' }) }))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('refers to short or empty secrets at construction time', () => {
    expect(() => new BearerTokenIdentityVerifier('')).toThrow(PlatformError);
    expect(() => new BearerTokenIdentityVerifier('short')).toThrow(PlatformError);
  });
});

describe('reconcileActorContext', () => {
  const store = new InMemoryPlatformStore();
  const memberships = new InMemoryTenantMembershipRepository(store);

  beforeEach(() => {
    // Reset the store between tests by creating a fresh one.
    // (the `beforeEach` in the describe above is a no-op for store;
    // individual tests do their own setup.)
  });

  it('throws AUTHENTICATION_REQUIRED when there is no membership', async () => {
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
