import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Code2, GraduationCap, MessageSquareText, Radio, Workflow } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ChatWidget } from '@/components/ChatWidget';

export const metadata: Metadata = { title: 'Resources' };

const resources = [
  [BookOpen, 'Documentation', 'Guides for workflow design, nodes, security and deployment.', '/platform#architecture', 'REFERENCE'],
  [Code2, 'Developer platform', 'Build custom nodes, connectors and agents with TypeScript.', '/app/canvas', 'BUILD'],
  [GraduationCap, 'Ase Academy', 'Learn process orchestration through practical industry patterns.', '/solutions', 'LEARN'],
  [MessageSquareText, 'Builder community', 'Share blueprints with automation builders across Africa.', 'mailto:hello@ase.africa?subject=Ase%20builder%20community', 'CONNECT'],
  [Workflow, 'Workflow gallery', 'Explore starting points for finance, people and operations.', '/marketplace?category=Workflow%20Templates', 'DISCOVER'],
  [Radio, 'System status', 'Understand the health model for voice, realtime and execution.', '#status', 'OPERATE'],
] as const;

export default function ResourcesPage() {
  return <><Header /><main>
    <section className="page-hero"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Learn and build</p><h1>Everything you need to make work flow.</h1><p>Practical guidance, working product paths and a community for turning business knowledge into useful automation.</p><div className="hero-actions"><Link className="btn btn-dark" href="#library">Browse the library</Link><Link className="btn btn-light" href="/app/canvas">Start building <ArrowRight size={15} /></Link></div></div></section>

    <section className="section section-paper" id="library"><div className="container"><div className="section-head"><div><p className="eyebrow"><span className="eyebrow-dot" /> Resource index</p><h2 className="h2">Choose the next useful step.</h2></div><p className="lede">No dead-end cards: each resource opens a relevant guide, workspace or conversation.</p></div><div className="solutions-grid">{resources.map(([Icon, title, copy, href, type], index) => <article className="solution-card" key={title}><div className="solution-card-meta"><span>{String(index + 1).padStart(2, '0')} / {type}</span><span className="solution-card-icon"><Icon size={19} /></span></div><h3>{title}</h3><p>{copy}</p>{href.startsWith('mailto:') || href.startsWith('#') ? <a href={href}>Open resource <ArrowRight size={13} /></a> : <Link href={href}>Open resource <ArrowRight size={13} /></Link>}</article>)}</div></div></section>

    <section className="section section-cream"><div className="container"><div className="market-split"><div><p className="eyebrow"><span className="eyebrow-dot" /> Featured guide</p><h2 className="h2">Voice-first workflow design.</h2><p className="lede">Design resilient conversations, handle accent variance and turn natural language into safe business actions with visible controls.</p><Link className="btn btn-dark" href="/app/voice">Open Voice Studio <ArrowRight size={14} /></Link></div><div className="personality-preview resource-preview"><div className="aura"><div className="aura-center" /></div><div className="preview-code"><span>guide://voice-first-workflows</span></div></div></div></div></section>

    <section className="section section-ink" id="status"><div className="container"><div className="section-head"><div><p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> System status model</p><h2 className="h2">Know what is moving.</h2></div><p className="lede">This demonstration reports product architecture—not live production availability. A production status surface will expose component-level telemetry and history.</p></div><div className="status-grid">{[['Workflow execution', 'DEMO READY'], ['Voice events', 'DEMO READY'], ['Canvas collaboration', 'FRONTEND PREVIEW'], ['Mobile synchronisation', 'FRONTEND PREVIEW']].map(([name, state]) => <div key={name}><i /><strong>{name}</strong><span>{state}</span></div>)}</div></div></section>
  </main><Footer /><ChatWidget /></>;
}
