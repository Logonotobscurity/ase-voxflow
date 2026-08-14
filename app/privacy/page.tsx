import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return <LegalPage eyebrow="Trust centre" title="Privacy that follows the work." intro="This product preview is designed around data minimisation, explicit controls and transparent processing." sections={[
    { title: 'What we collect', body: 'Ase may process account details, workflow configuration, usage telemetry and business records that an authorised customer chooses to connect. This demonstration does not request payment information.' },
    { title: 'How data is used', body: 'Data is used to provide workflow, voice, collaboration and support experiences; maintain security; and improve product reliability. Customer business records are not sold.' },
    { title: 'Voice and media', body: 'Voice or media is processed only when a user starts the relevant experience. Production deployments should apply customer-defined retention, consent and regional processing controls.' },
    { title: 'Your choices', body: 'Administrators can define access, retention and integration scopes. Individuals can request access, correction or deletion through the organisation responsible for their workspace.' },
  ]} />;
}
