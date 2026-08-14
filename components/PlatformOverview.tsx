import Link from 'next/link';
import {
  ArrowRight,
  AudioLines,
  Boxes,
  Braces,
  Check,
  Database,
  GitBranch,
  Mic2,
  Network,
  Play,
  ShieldCheck,
  Store,
  Workflow,
} from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';
import { ChatWidget } from './ChatWidget';
import { AseSystemDiagram } from './AseSystemDiagram';

const entryPoints = [
  {
    number: '01',
    icon: Workflow,
    title: 'Visual Canvas',
    copy: 'Design, validate and run canonical demo workflow graphs in one inspectable space.',
    href: '/app/canvas',
    cta: 'Open canvas',
  },
  {
    number: '02',
    icon: Mic2,
    title: 'Voice Studio',
    copy: 'Prototype UI states for future multilingual voice interactions; no media provider is connected.',
    href: '/app/voice',
    cta: 'Open studio',
  },
  {
    number: '03',
    icon: Store,
    title: 'Vendor Operations',
    copy: 'Explore sample registration, risk, purchasing and performance interfaces.',
    href: '/app/vendors',
    cta: 'View operations',
  },
  {
    number: '04',
    icon: Boxes,
    title: 'Marketplace',
    copy: 'Inspect curated agent concepts, integration targets and process previews.',
    href: '/marketplace',
    cta: 'Browse solutions',
  },
];

export function PlatformOverview() {
  return (
    <>
      <Header />
      <main>
        <section className="page-hero platform-hero">
          <div className="container platform-hero-grid">
            <div>
              <p className="eyebrow"><span className="eyebrow-dot" /> VOXFLOW platform</p>
              <h1>Operational intelligence, from signal to outcome.</h1>
              <p>Capture a workflow, make policy decisions visible and run deterministic demo handlers through one canonical contract. External systems remain fail-closed until adapters are verified.</p>
              <div className="hero-actions"><Link href="/app/canvas" className="btn btn-dark">Build your first flow <ArrowRight size={16} /></Link><Link href="#platform-map" className="btn btn-light">Explore the system</Link></div>
            </div>
            <div className="platform-mini-map" aria-label="VOXFLOW platform layers">
              <div className="mini-map-head"><span>VOXFLOW / SYSTEM MAP</span><span className="tag tag-ink">P0 MAP</span></div>
              {[
                ['INPUT', 'Text proposal · Event shape · Form · API', AudioLines],
                ['ORCHESTRATE', 'Rules · Agent contracts · Human gates', GitBranch],
                ['ACT', 'Proposed system · Vendor · Team actions', Play],
                ['GOVERN', 'Events · Demo RBAC · Versions', ShieldCheck],
              ].map(([label, detail, Icon], index) => (
                <div className="mini-map-row" key={label as string}><span>{String(index + 1).padStart(2, '0')}</span><i><Icon size={18} /></i><div><strong>{label as string}</strong><small>{detail as string}</small></div>{index < 3 && <b aria-hidden="true" />}</div>
              ))}
            </div>
          </div>
        </section>

        <section className="platform-jump" aria-label="Platform sections">
          <div className="container platform-jump-inner"><span>Start where the value is</span>{entryPoints.map((item) => <Link href={`#${item.title.toLowerCase().replaceAll(' ', '-')}`} key={item.title}>{item.number} {item.title}</Link>)}</div>
        </section>

        <section className="section section-paper">
          <div className="container">
            <div className="section-head"><div><p className="eyebrow"><span className="eyebrow-dot" /> Product entry points</p><h2 className="h2">One platform.<br />Four useful ways in.</h2></div><p className="lede">Choose the surface that matches the job. Each route distinguishes the canonical runtime path from scripted or illustrative previews.</p></div>
            <div className="entry-grid">
              {entryPoints.map(({ number, icon: Icon, title, copy, href, cta }) => (
                <article id={title.toLowerCase().replaceAll(' ', '-')} className="entry-card" key={title}>
                  <div className="entry-card-top"><span>{number}</span><i><Icon size={23} /></i></div>
                  <h3>{title}</h3><p>{copy}</p><Link className="text-link" href={href}>{cta} <ArrowRight size={15} /></Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-cream" id="platform-map">
          <div className="container system-story-grid platform-system-grid">
            <div>
              <p className="eyebrow"><span className="eyebrow-dot" /> Target execution model</p>
              <h2 className="h2">Different signals.<br />One canonical record.</h2>
              <p className="lede">The P0 runtime unifies canonical workflow records and correlated evidence. Voice media, field sync and external business-event transports remain target integrations.</p>
              <div className="principle-list">
                {['Target: synchronize context across teams and devices', 'Target: queue offline changes until reconnection', 'Implemented: version workflow records and correlated events', 'Architecture: separate collaboration, media and event responsibilities'].map((text) => <span key={text}><Check size={15} /> {text}</span>)}
              </div>
            </div>
            <div className="system-diagram-wrap"><AseSystemDiagram /></div>
          </div>
        </section>

        <section className="section section-ink">
          <div className="container">
            <div className="section-head"><div><p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Delivery architecture</p><h2 className="h2">Know what exists and what is next.</h2></div><p className="lede">The canonical visual/API path runs in explicit demo mode. The transport and durable infrastructure below remain separated by implementation status.</p></div>
            <div className="stack-grid">
              {[
                [Braces, 'Interfaces · implemented', 'Next.js application surfaces, route handlers and the React Flow canvas.'],
                [Network, 'Realtime · target', 'Liveblocks, WebRTC, NATS and Socket.io responsibilities are defined but not integrated.'],
                [Database, 'Persistence · adapter only', 'PostgreSQL 16 and Prisma artifacts compile; live database behavior is unverified.'],
                [ShieldCheck, 'Control plane · P0', 'Demo RBAC, correlated events and explicit approvals exist; immutable audit storage is not yet proven.'],
              ].map(([Icon, title, copy]) => <article className="stack-card" key={title as string}><i><Icon size={21} /></i><h3>{title as string}</h3><p>{copy as string}</p></article>)}
            </div>
          </div>
        </section>

        <section className="section section-amber closing-section">
          <div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Build the first route</p><h2 className="h2">Bring one process.<br />Leave with a working flow.</h2><p className="lede">Start on the canonical demo canvas, or inspect a curated preview you can adapt.</p><div className="hero-actions"><Link className="btn btn-dark" href="/app/canvas">Open Visual Canvas <ArrowRight size={15} /></Link><Link className="btn btn-light" href="/marketplace">Browse marketplace</Link></div></div>
        </section>
      </main>
      <Footer />
      <ChatWidget />
    </>
  );
}
