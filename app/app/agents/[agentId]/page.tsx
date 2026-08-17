import { AgentDetailPage } from './AgentDetailPage';

export default function Page({ params }: { params: Promise<{ agentId: string }> }) {
  return <AgentDetailPage params={params} />;
}
