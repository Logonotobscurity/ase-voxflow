'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRight,
  Blocks,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Factory,
  LayoutDashboard,
  Menu,
  Mic2,
  Network,
  Store,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Brand } from './Brand';

type MenuName = 'platform' | 'marketplace' | null;

export function Header() {
  const pathname = usePathname();
  const [menu, setMenu] = useState<MenuName>(null);
  const [mobile, setMobile] = useState(false);
  const root = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const platformButtonRef = useRef<HTMLButtonElement>(null);
  const marketplaceButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (mobile) {
        setMobile(false);
        window.setTimeout(() => mobileToggleRef.current?.focus(), 0);
      }
      if (menu) {
        const button = menu === 'platform' ? platformButtonRef.current : marketplaceButtonRef.current;
        setMenu(null);
        window.setTimeout(() => button?.focus(), 0);
      }
    };
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menu, mobile]);

  useEffect(() => {
    setMenu(null);
    setMobile(false);
  }, [pathname]);

  useEffect(() => {
    if (menu) window.setTimeout(() => dropdownRef.current?.querySelector<HTMLElement>('a')?.focus(), 0);
  }, [menu]);

  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
    if (mobile) window.setTimeout(() => document.querySelector<HTMLElement>('.mobile-sheet a')?.focus(), 0);
    return () => { document.body.style.overflow = ''; };
  }, [mobile]);

  const toggle = (name: Exclude<MenuName, null>) => setMenu((current) => current === name ? null : name);

  return (
    <header className="site-nav" ref={root}>
      <div className="container nav-inner">
        <Brand />
        <nav className="nav-links" aria-label="Primary navigation">
          <div className="nav-menu">
            <button
              ref={platformButtonRef}
              className={`nav-link ${pathname.startsWith('/platform') || pathname.startsWith('/app') ? 'active' : ''}`}
              onClick={() => toggle('platform')}
              aria-expanded={menu === 'platform'}
              aria-controls="platform-menu"
              aria-haspopup="menu"
            >
              Platform <ChevronDown size={13} />
            </button>
            {menu === 'platform' && (
              <div id="platform-menu" className="nav-dropdown" ref={dropdownRef} role="menu">
                <div className="drop-title">Build and operate</div>
                <Link className="drop-item" href="/platform" role="menuitem"><span className="drop-icon"><LayoutDashboard size={17} /></span><span><strong>Platform overview</strong><span>See how the complete operating layer fits together.</span></span></Link>
                <Link className="drop-item" href="/app/canvas" role="menuitem"><span className="drop-icon"><Network size={17} /></span><span><strong>Visual Canvas</strong><span>Design and run canonical demo workflow graphs.</span></span></Link>
                <Link className="drop-item" href="/app/voice" role="menuitem"><span className="drop-icon"><Mic2 size={17} /></span><span><strong>Voice Studio</strong><span>Prototype multilingual, action-bound agents.</span></span></Link>
                <Link className="drop-item" href="/app/vendors" role="menuitem"><span className="drop-icon"><BriefcaseBusiness size={17} /></span><span><strong>Vendor Operations</strong><span>Explore sample registration, purchasing, risk and performance UI.</span></span></Link>
              </div>
            )}
          </div>
          <Link className={`nav-link ${pathname === '/solutions' ? 'active' : ''}`} href="/solutions">Solutions</Link>
          <div className="nav-menu">
            <button
              ref={marketplaceButtonRef}
              className={`nav-link ${pathname === '/marketplace' ? 'active' : ''}`}
              onClick={() => toggle('marketplace')}
              aria-expanded={menu === 'marketplace'}
              aria-controls="marketplace-menu"
              aria-haspopup="menu"
            >
              Marketplace <ChevronDown size={13} />
            </button>
            {menu === 'marketplace' && (
              <div id="marketplace-menu" className="nav-dropdown wide" ref={dropdownRef} role="menu">
                <div>
                  <div className="drop-title">Discover</div>
                  <Link className="drop-item" href="/marketplace" role="menuitem"><span className="drop-icon"><Store size={17} /></span><span><strong>Explore all solutions</strong><span>Agents, connectors and workflow blueprints.</span></span></Link>
                  <Link className="drop-item" href="/solutions" role="menuitem"><span className="drop-icon"><Factory size={17} /></span><span><strong>Industry solutions</strong><span>Start with patterns shaped for your sector.</span></span></Link>
                  <Link className="drop-item" href="/resources" role="menuitem"><span className="drop-icon"><Users size={17} /></span><span><strong>Builder resources</strong><span>Guides, documentation and community.</span></span></Link>
                </div>
                <div>
                  <div className="drop-title">Create</div>
                  <Link className="drop-item" href="/app/canvas" role="menuitem"><span className="drop-icon"><Bot size={17} /></span><span><strong>Build an agent flow</strong><span>Start with VOXFLOW&apos;s visual canvas.</span></span></Link>
                  <Link className="drop-item" href="/resources" role="menuitem"><span className="drop-icon"><Upload size={17} /></span><span><strong>Publishing roadmap</strong><span>Review the intended path for reusable solutions.</span></span></Link>
                  <Link className="drop-item" href="/company" role="menuitem"><span className="drop-icon"><CircleDollarSign size={17} /></span><span><strong>Creator roadmap</strong><span>Discuss future builder and commercial rails.</span></span></Link>
                </div>
              </div>
            )}
          </div>
          <Link className={`nav-link ${pathname === '/resources' ? 'active' : ''}`} href="/resources">Resources</Link>
          <Link className={`nav-link ${pathname === '/company' ? 'active' : ''}`} href="/company">Company</Link>
        </nav>
        <div className="nav-actions">
          <Link className="btn btn-ghost" href="/platform">See platform</Link>
          <Link className="btn btn-dark" href="/app/canvas">Open canvas <ArrowRight size={15} /></Link>
        </div>
        <button ref={mobileToggleRef} className="mobile-toggle" onClick={() => setMobile((value) => !value)} aria-expanded={mobile} aria-controls="mobile-navigation" aria-label={mobile ? 'Close menu' : 'Open menu'}>{mobile ? <X /> : <Menu />}</button>
      </div>
      {mobile && (
        <nav id="mobile-navigation" className="mobile-sheet" aria-label="Mobile navigation">
          <Link href="/platform">Platform overview <ChevronRight size={17} /></Link>
          <Link href="/app/canvas">Visual Canvas <Network size={17} /></Link>
          <Link href="/app/voice">Voice Studio <Mic2 size={17} /></Link>
          <Link href="/app/vendors">Vendor Operations <BriefcaseBusiness size={17} /></Link>
          <Link href="/solutions">Solutions <Zap size={17} /></Link>
          <Link href="/marketplace">Marketplace <Blocks size={17} /></Link>
          <Link href="/resources">Resources <ChevronRight size={17} /></Link>
          <Link href="/company">Company <ChevronRight size={17} /></Link>
          <div className="mobile-actions"><Link className="btn btn-light" href="/platform">See platform</Link><Link className="btn btn-dark" href="/app/canvas">Open canvas</Link></div>
        </nav>
      )}
    </header>
  );
}
