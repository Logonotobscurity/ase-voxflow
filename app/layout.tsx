import type { Metadata, Viewport } from 'next';
import './globals.css';
import './revamp.css';
import { PwaRegister } from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: { default: 'Ase — Operational intelligence in motion', template: '%s · Ase' },
  description: 'Turn operational knowledge, voice and enterprise systems into visible, governed workflows with Ase VOXFLOW.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffcc33' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<PwaRegister /></body></html>;
}
