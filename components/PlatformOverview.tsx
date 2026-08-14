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
    copy: 'Design, test and run multi-agent workflows in one inspectable space.',
    href: '/app/canvas',
    cta: 'Open canvas',
  },
  {
    number: '02',
    icon: Mic2,
    title: 'Voice Studio',
    copy: 'Prototype multilingual voice interactions and action-bound agent states.',
    href: '/app/voice',
    cta: 'Open studio',
  },
  {
    number: '03',
    icon: Store,
    title: 'Vendor Operations',
    copy: 'Run registration, risk, purchasing and performance from one command centre.',
    href: '/app/vendors',
    cta: 'View operations',
  },
  {
    number: '04',
    icon: Boxes,
    title: 'Marketplace',
    copy: 'Install proven agents, integrations and process blueprints, then adapt them.',
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
              <p>Capture what needs to happen, make every decision visible and run the work safely across people, AI agents and enterprise systems.</p>
              <div className="hero-actions"><Link href="/app/canvas" className="btn btn-dark">Build your first flow <ArrowRight size={16} /></Link><Link href="#platform-map" className="btn btn-light">Explore the system</Link></div>
            </div>
            <div className="platform-mini-map" aria-label="VOXFLOW platform layers">
              <div className="mini-map-head"><span>VOXFLOW / SYSTEM MAP</span><span className="tag tag-ink">LIVE</span></div>
              {[
                ['INPUT', 'Voice · Event · Form · API', AudioLines],
                ['ORCHESTRATE', 'Rules · Agents · Human gates', GitBranch],
                ['ACT', 'Systems · Vendors · Teams', Play],
                ['GOVERN', 'Audit · RBAC · Versions', ShieldCheck],
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
            <div className="section-head"><div><p className="eyebrow"><span className="eyebrow-dot" /> Product entry points</p><h2 className="h2">One platform.<br />Four useful ways in.</h2></div><p className="lede">Choose the surface that matches the job. Every route connects back to the same governed workflow layer.</p></div>
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
              <p className="eyebrow"><span className="eyebrow-dot" /> Shared execution model</p>
              <h2 className="h2">Different signals.<br />One reliable record.</h2>
              <p className="lede">Voice requests, business events and field activity converge into an explicit route. Ase keeps the context, decision and outcome together.</p>
              <div className="principle-list">
                {['Synchronize context across teams and devices', 'Keep offline changes safe until reconnection', 'Version every decision and workflow change', 'Separate collaboration, media and event responsibilities'].map((text) => <span key={text}><Check size={15} /> {text}</span>)}
              </div>
            </div>
            <div className="system-diagram-wrap"><AseSystemDiagram /></div>
          </div>
        </section>

        <section className="section section-ink">
          <div className="container">
            <div className="section-head"><div><p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Works with your stack</p><h2 className="h2">Drop in where the work is.</h2></div><p className="lede">Use the visual layer, APIs or event fabric without surrendering ownership of your data and systems.</p></div>
            <div className="stack-grid">
              {[
                [Braces, 'Interfaces', 'Next.js application surfaces, SDKs and embeddable agent UI components.'],
                [Network, 'Realtime', 'Liveblocks for canvas state, WebRTC for media, NATS for voice events and Socket.io for mobile sync.'],
                [Database, 'Source of truth', 'PostgreSQL 16 and Prisma for durable business records and workflow metadata.'],
                [ShieldCheck, 'Control plane', 'Role-based access, environment promotion, immutable audit records and explicit approvals.'],
              ].map(([Icon, title, copy]) => <article className="stack-card" key={title as string}><i><Icon size={21} /></i><h3>{title as string}</h3><p>{copy as string}</p></article>)}
            </div>
          </div>
        </section>

        <section className="section section-amber closing-section">
          <div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Build the first route</p><h2 className="h2">Bring one process.<br />Leave with a working flow.</h2><p className="lede">Start on the canvas, or browse a production blueprint you can adapt.</p><div className="hero-actions"><Link className="btn btn-dark" href="/app/canvas">Open Visual Canvas <ArrowRight size={15} /></Link><Link className="btn btn-light" href="/marketplace">Browse marketplace</Link></div></div>
        </section>
      </main>
      <Footer />
      <ChatWidget />
    </>
  );
}
