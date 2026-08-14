'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Blocks, Bot, BriefcaseBusiness, ChevronDown, ChevronRight, CircleDollarSign, Factory, Menu, Mic2, Network, Store, Upload, Users, X, Zap } from 'lucide-react';
import { Brand } from './Brand';

type MenuName = 'platform' | 'marketplace' | null;

export function Header() {
  const pathname = usePathname();
  const [menu, setMenu] = useState<MenuName>(null);
  const [mobile, setMobile] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setMobile(false); } };
    const onClick = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setMenu(null); };
    document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, []);
  useEffect(() => { setMenu(null); setMobile(false); }, [pathname]);

  const toggle = (name: MenuName) => setMenu(menu === name ? null : name);
  return <header className="site-nav" ref={root}>
    <div className="container nav-inner">
      <Brand />
      <nav className="nav-links" aria-label="Primary navigation">
        <div className="nav-menu">
          <button className={`nav-link ${pathname.startsWith('/platform') || pathname.startsWith('/app') ? 'active':''}`} onClick={() => toggle('platform')} aria-expanded={menu==='platform'}>Platform <ChevronDown size={13}/></button>
          {menu === 'platform' && <div className="nav-dropdown">
            <div className="drop-title">Build and operate</div>
            <Link className="drop-item" href="/platform"><span className="drop-icon"><Network size={17}/></span><span><strong>Visual Canvas</strong><span>Design, test and run multi-agent workflows.</span></span></Link>
            <Link className="drop-item" href="/app/voice"><span className="drop-icon"><Mic2 size={17}/></span><span><strong>Voice Studio</strong><span>Give every agent a responsive audio personality.</span></span></Link>
            <Link className="drop-item" href="/app/vendors"><span className="drop-icon"><BriefcaseBusiness size={17}/></span><span><strong>Vendor Operations</strong><span>Registration, POs, risk and performance in one view.</span></span></Link>
          </div>}
        </div>
        <Link className={`nav-link ${pathname==='/solutions'?'active':''}`} href="/solutions">Solutions</Link>
        <div className="nav-menu">
          <button className={`nav-link ${pathname==='/marketplace'?'active':''}`} onClick={() => toggle('marketplace')} aria-expanded={menu==='marketplace'}>Marketplace <ChevronDown size={13}/></button>
          {menu === 'marketplace' && <div className="nav-dropdown wide">
            <div><div className="drop-title">Discover</div>
              <Link className="drop-item" href="/marketplace"><span className="drop-icon"><Store size={17}/></span><span><strong>Explore all agents</strong><span>Browse our full agent catalog</span></span></Link>
              <Link className="drop-item" href="/solutions"><span className="drop-icon"><Factory size={17}/></span><span><strong>Industry solutions</strong><span>Automation built for your sector</span></span></Link>
              <Link className="drop-item" href="/resources"><span className="drop-icon"><Users size={17}/></span><span><strong>Community innovations</strong><span>User-created automations</span></span></Link>
            </div><div><div className="drop-title">Create</div>
              <Link className="drop-item" href="/marketplace"><span className="drop-icon"><Bot size={17}/></span><span><strong>Become an agent creator</strong><span>Start building intelligent agents</span></span></Link>
              <Link className="drop-item" href="/marketplace"><span className="drop-icon"><Upload size={17}/></span><span><strong>Publish automations</strong><span>Share your workflows</span></span></Link>
              <Link className="drop-item" href="/marketplace"><span className="drop-icon"><CircleDollarSign size={17}/></span><span><strong>Monetize intelligence</strong><span>Earn from your creations</span></span></Link>
            </div>
          </div>}
        </div>
        <Link className={`nav-link ${pathname==='/company'?'active':''}`} href="/company">Company</Link>
        <Link className={`nav-link ${pathname==='/resources'?'active':''}`} href="/resources">Resources</Link>
      </nav>
      <div className="nav-actions"><Link className="btn btn-ghost" href="/platform">Try for free</Link><Link className="btn btn-primary" href="/platform">Get started <ChevronRight size={15}/></Link></div>
      <button className="mobile-toggle" onClick={()=>setMobile(v=>!v)} aria-label={mobile?'Close menu':'Open menu'}>{mobile?<X/>:<Menu/>}</button>
    </div>
    {mobile && <div className="mobile-sheet">
      <Link href="/platform">Visual Canvas <Network size={17}/></Link>
      <Link href="/app/voice">Voice Studio <Mic2 size={17}/></Link>
      <Link href="/app/vendors">Vendor Operations <BriefcaseBusiness size={17}/></Link>
      <Link href="/solutions">Solutions <Zap size={17}/></Link>
      <Link href="/marketplace">Marketplace <Blocks size={17}/></Link>
      <Link href="/company">Company <ChevronRight size={17}/></Link>
      <Link href="/resources">Resources <ChevronRight size={17}/></Link>
      <div className="mobile-actions"><Link className="btn btn-ghost" href="/platform">Try for free</Link><Link className="btn btn-primary" href="/platform">Get started</Link></div>
    </div>}
  </header>;
}
