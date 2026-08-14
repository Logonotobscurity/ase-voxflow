import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Globe2, HeartHandshake, Lightbulb, MapPin, ShieldCheck } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ChatWidget } from '@/components/ChatWidget';

export const metadata: Metadata = { title: 'Company' };

const values = [
  [Globe2, 'Context over convention', 'Built around local terminology, currencies, networks and operating models.'],
  [HeartHandshake, 'People before process', 'AI that strengthens human judgment instead of hiding it behind a black box.'],
  [ShieldCheck, 'Trust by design', 'Explicit policy, approval and evidence boundaries before consequential workflow actions.'],
  [Lightbulb, 'Practical ambition', 'Start with a bounded workflow path, then require evidence before expanding scope.'],
] as const;

export default function CompanyPage() {
  return <><Header /><main>
    <section className="page-hero"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> About Ase</p><h1>We make intelligence operational.</h1><p>Ase is building the workflow layer for ambitious African businesses—where voice, process and enterprise systems become one reliable operating fabric.</p><div className="hero-actions"><a className="btn btn-dark" href="mailto:hello@ase.africa">Work with us <ArrowRight size={15} /></a><Link className="btn btn-light" href="/platform">See the platform</Link></div></div></section>

    <section className="section section-paper"><div className="container"><div className="market-split"><div><p className="eyebrow"><span className="eyebrow-dot" /> Our purpose</p><h2 className="h2">Technology that understands the work.</h2></div><p className="lede">Most automation assumes stable connectivity, imported terminology and technical operators. Ase starts elsewhere: the best systems meet people where they are and adapt to how their businesses actually run.</p></div><div className="card-grid" style={{marginTop:60}}>{values.map(([Icon, title, copy], index) => <article className="value-card" key={title}><span className="card-card-number">{String(index + 1).padStart(2, '0')}</span><span className="card-icon"><Icon size={20} /></span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

    <section className="section section-ink"><div className="container"><div className="section-head"><div><p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Built close to the work</p><h2 className="h2">African context.<br />Global engineering.</h2></div><p className="lede">Our product decisions begin with the environments where teams operate—across languages, infrastructure realities and fast-changing markets.</p></div><div className="location-grid">{[
      ['Port Harcourt', 'Operations and energy context'], ['Lagos', 'Product and commercial systems'], ['Nairobi', 'East African market intelligence'], ['Johannesburg', 'Enterprise and regional scale'],
    ].map(([city, focus], index) => <article key={city}><MapPin size={19} /><span>{String(index + 1).padStart(2, '0')}</span><h3>{city}</h3><p>{focus}</p></article>)}</div></div></section>

    <section className="section section-amber closing-section"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Build with us</p><h2 className="h2">Bring an important operation.<br />Leave with a visible path.</h2><p className="lede">Whether you are deploying, integrating or joining the team, start with the work that needs to move.</p><div className="hero-actions"><a className="btn btn-dark" href="mailto:hello@ase.africa">Start a conversation <ArrowRight size={15} /></a><Link className="btn btn-light" href="/app/canvas">Open Visual Canvas</Link></div></div></section>
  </main><Footer /><ChatWidget /></>;
}
