import type { Metadata } from 'next';
import { CanvasStudio } from '@/components/CanvasStudio';
export const metadata: Metadata = { title: 'Visual Canvas' };
export default function PlatformPage(){ return <CanvasStudio/>; }
