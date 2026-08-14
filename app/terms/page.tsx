import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return <LegalPage eyebrow="Trust centre" title="Clear terms for shared work." intro="These concise preview terms explain the expected use of Ase and VOXFLOW while the service remains in demonstration scope." sections={[
    { title: 'Using the service', body: 'Use Ase only for lawful, authorised business activity. You are responsible for the workflows, connected systems and data configured in your workspace.' },
    { title: 'Accounts and access', body: 'Keep credentials secure, provide access only to authorised collaborators and promptly remove people who no longer require workspace access.' },
    { title: 'Automation decisions', body: 'Review high-impact workflows and preserve appropriate human approvals. Preview agents and recommendations should not be treated as a substitute for professional judgment.' },
    { title: 'Availability and changes', body: 'This frontend demonstration may change as the product develops. Production commitments, service levels and commercial terms require a separate written agreement.' },
  ]} />;
}
