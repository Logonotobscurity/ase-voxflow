'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Boxes, Cable, ChevronDown, LayoutDashboard, PlaySquare, ScrollText, ShieldAlert, Users, Wallet, Workflow } from 'lucide-react';

const NAV = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/workflows', label: 'Workflows', icon: Workflow },
  { href: '/app/agents', label: 'Agents', icon: Bot },
  { href: '/app/tools', label: 'Tools', icon: Boxes },
  { href: '/app/mcp', label: 'MCP', icon: Cable },
  { href: '/app/runs', label: 'Runs', icon: PlaySquare },
  { href: '/app/approvals', label: 'Approvals', icon: ShieldAlert },
  { href: '/app/usage', label: 'Usage', icon: Wallet },
  { href: '/app/audit', label: 'Audit', icon: ScrollText },
  { href: '/app/team', label: 'Team', icon: Users },
];

/**
 * App shell for the /app surfaces — a top bar over a scrolling main area.
 * The shell is presentational; each route owns its own domain data fetch
 * (Route → Domain Ownership in docs/ROUTE_ARCHITECTURE_SPEC.md §42).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <Link href="/" className="app-shell-brand" aria-label="Ase / VOXFLOW home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="app-shell-brand-name">
            Ase <small>VOXFLOW</small>
          </span>
        </Link>
        <nav className="app-shell-nav" aria-label="Application">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-shell-link ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="app-shell-spacer" />
        <Link className="app-shell-link muted" href="/platform">
          Product overview
        </Link>
        <span className="user-pill" title="Demo identity (ASE_RUNTIME_MODE=demo)">
          <span className="user-photo">AM</span>
          <span style={{ fontSize: 10, fontWeight: 750 }}>Ada M. · demo</span>
          <ChevronDown size={12} />
        </span>
      </header>
      <main className="app-shell-main">{children}</main>
    </div>
  );
}
