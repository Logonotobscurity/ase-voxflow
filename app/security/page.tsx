import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Security' };

export default function SecurityPage() {
  return <LegalPage eyebrow="Trust centre" title="Control is part of the flow." intro="Ase is designed so identity, data boundaries and operational approvals remain visible—not bolted on after deployment." sections={[
    { title: 'Identity and access', body: 'The target architecture supports role-based access, least-privilege integration scopes and environment-aware permissions for authors, reviewers and operators.' },
    { title: 'Data protection', body: 'Production data should be encrypted in transit and at rest, isolated by workspace and governed through customer-defined retention and regional processing policies.' },
    { title: 'Workflow governance', body: 'Versions, approvals and execution events are designed to produce a durable audit trail. Sensitive actions can require explicit human gates before execution.' },
    { title: 'Responsible disclosure', body: 'Security researchers can report a potential issue to security@ase.africa. Include reproducible detail and avoid accessing data that is not yours.' },
  ]} />;
}
