import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Code2, GraduationCap, MessageSquareText, Radio, Workflow } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ChatWidget } from '@/components/ChatWidget';

export const metadata: Metadata = { title: 'Resources' };

const resources = [
  [BookOpen, 'Architecture overview', 'Review current workflow, control and delivery boundaries.', '/platform#architecture', 'REFERENCE'],
  [Code2, 'Visual builder', 'Edit and run the canonical graph through the current demo canvas.', '/app/canvas', 'BUILD'],
  [GraduationCap, 'Industry patterns', 'Explore illustrative process-orchestration starting points.', '/solutions', 'LEARN'],
  [MessageSquareText, 'Builder conversation', 'Contact the team about a workflow pattern or contribution.', 'mailto:hello@ase.africa?subject=Ase%20builder%20conversation', 'CONNECT'],
  [Workflow, 'Workflow gallery', 'Explore illustrative finance, people and operations starting points.', '/marketplace?category=Workflow%20Templates', 'DISCOVER'],
  [Radio, 'Capability status', 'Distinguish verified demo paths from roadmap integrations.', '#status', 'VERIFY'],
] as const;

export default function ResourcesPage() {
  return <><Header /><main>
    <section className="page-hero"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Inspect and evaluate</p><h1>Trace the platform from concept to evidence.</h1><p>Current architecture references, verified demo paths and illustrative patterns for evaluating Ase and shaping the next implementation increment.</p><div className="hero-actions"><Link className="btn btn-dark" href="#library">Browse the index</Link><Link className="btn btn-light" href="/app/canvas">Open the canvas <ArrowRight size={15} /></Link></div></div></section>

    <section className="section section-paper" id="library"><div className="container"><div className="section-head"><div><p className="eyebrow"><span className="eyebrow-dot" /> Resource index</p><h2 className="h2">Choose the next useful step.</h2></div><p className="lede">Each card opens a current product surface, architecture reference or direct conversation—not a promised integration.</p></div><div className="solutions-grid">{resources.map(([Icon, title, copy, href, type], index) => <article className="solution-card" key={title}><div className="solution-card-meta"><span>{String(index + 1).padStart(2, '0')} / {type}</span><span className="solution-card-icon"><Icon size={19} /></span></div><h3>{title}</h3><p>{copy}</p>{href.startsWith('mailto:') || href.startsWith('#') ? <a href={href}>Open resource <ArrowRight size={13} /></a> : <Link href={href}>Open resource <ArrowRight size={13} /></Link>}</article>)}</div></div></section>

    <section className="section section-cream"><div className="container"><div className="market-split"><div><p className="eyebrow"><span className="eyebrow-dot" /> Scripted preview</p><h2 className="h2">Voice-command proposal flow.</h2><p className="lede">Inspect how a text command can become a bounded proposal with visible policy and approval states. Recording, transcription and synthesis providers are not connected.</p><Link className="btn btn-dark" href="/app/voice">Open Voice Studio <ArrowRight size={14} /></Link></div><div className="personality-preview resource-preview"><div className="aura"><div className="aura-center" /></div><div className="preview-code"><span>preview://voice-command-flow</span></div></div></div></div></section>

    <section className="section section-ink" id="status"><div className="container"><div className="section-head"><div><p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Capability boundary</p><h2 className="h2">Know what has evidence.</h2></div><p className="lede">These labels describe implementation evidence in this repository—not live production availability, uptime or external-provider health.</p></div><div className="status-grid">{[['Canonical workflow runtime', 'VERIFIED IN MEMORY DEMO'], ['Text voice classification', 'VERIFIED IN MEMORY DEMO'], ['Liveblocks canvas CRDT', 'NOT INTEGRATED'], ['Mobile Socket.io sync', 'NOT INTEGRATED']].map(([name, state]) => <div key={name}><i /><strong>{name}</strong><span>{state}</span></div>)}</div></div></section>
  </main><Footer /><ChatWidget /></>;
}
