import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return <LegalPage eyebrow="Trust centre" title="Privacy that follows the work." intro="This page records design principles for the Ase product preview. It is not a certification, production guarantee or substitute for signed customer terms." sections={[
    { title: 'Current preview boundary', body: 'The repository includes demo identity and memory-mode execution paths. It does not prove a production account, telemetry, retention or customer-data programme, and no payment information is requested by the preview.' },
    { title: 'Intended data use', body: 'A production deployment may need account details, workflow configuration, operational records and service telemetry to deliver agreed features. Collection, purpose, processors and retention must be documented for that deployment.' },
    { title: 'Voice and media', body: 'The current legacy transcription and synthesis provider routes fail closed; they do not produce or retain provider media results. Any future provider integration must add explicit consent, retention and regional-processing controls.' },
    { title: 'Administrative controls', body: 'Canonical policy and approval contracts exist, but production identity, administrator access, deletion operations and tenant provisioning remain deployment work. Applicable rights should be exercised through the organisation responsible for a future workspace.' },
  ]} />;
}
