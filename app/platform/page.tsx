import type { Metadata } from 'next';
import { PlatformOverview } from '@/components/PlatformOverview';

export const metadata: Metadata = {
  title: 'VOXFLOW Platform',
  description: 'Explore Ase VOXFLOW: visual workflows, voice agents, vendor operations and an installable intelligence marketplace.',
};

export default function PlatformPage() {
  return <PlatformOverview />;
}
