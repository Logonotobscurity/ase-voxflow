import type { Metadata } from 'next';
import { PlatformOverview } from '@/components/PlatformOverview';

export const metadata: Metadata = {
  title: 'VOXFLOW Platform',
  description: 'Explore Ase VOXFLOW: a canonical visual workflow demo, bounded execution contracts, and labelled voice, vendor and marketplace previews.',
};

export default function PlatformPage() {
  return <PlatformOverview />;
}
