import type { Metadata } from 'next';
import { MarketplacePage } from '@/components/MarketplacePage';
export const metadata: Metadata = { title: 'Agent Marketplace', description: 'Discover AI agents, workflow templates and enterprise connectors.' };
export default function Page(){ return <MarketplacePage/>; }
