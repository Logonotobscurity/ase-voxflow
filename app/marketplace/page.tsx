import type { Metadata } from 'next';
import { MarketplacePage } from '@/components/MarketplacePage';
export const metadata: Metadata = { title: 'Agent Marketplace', description: 'Explore curated agent concepts, workflow previews and connector targets for the Ase canvas demo.' };
export default function Page(){ return <MarketplacePage/>; }
