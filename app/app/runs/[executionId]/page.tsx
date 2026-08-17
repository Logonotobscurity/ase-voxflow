import { RunDetailPage } from './RunDetailPage';

export default function Page({ params }: { params: Promise<{ executionId: string }> }) {
  return <RunDetailPage params={params} />;
}
