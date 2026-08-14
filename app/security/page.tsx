import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Security' };

export default function SecurityPage() {
  return <LegalPage eyebrow="Trust centre" title="Control is part of the flow." intro="This page distinguishes controls present in the preview from production security work that still requires a verified deployment." sections={[
    { title: 'Identity and access', body: 'Canonical role and permission checks exist, but the current demo headers are spoofable and are not authentication. Trusted identity and tenant-membership verification are not implemented.' },
    { title: 'Data protection', body: 'A production deployment must verify encryption in transit and at rest, tenant isolation, secret handling, retention and regional processing. Those deployment controls are not proven by this repository.' },
    { title: 'Workflow governance', body: 'The runtime records versioned workflow state, correlated events, execution evidence and explicit approval stops. Durable audit delivery, approval resumption and external side-effect adapters remain unimplemented or unverified.' },
    { title: 'Responsible disclosure', body: 'Security researchers can report a potential issue to security@ase.africa. Include reproducible detail and avoid accessing data that is not yours.' },
  ]} />;
}
