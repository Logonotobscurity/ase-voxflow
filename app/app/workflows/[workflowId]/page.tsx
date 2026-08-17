import { WorkflowDetailPage } from './WorkflowDetailPage';

export default function Page({ params }: { params: Promise<{ workflowId: string }> }) {
  return <WorkflowDetailPage params={params} />;
}
