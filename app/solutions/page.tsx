import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  Factory,
  Fuel,
  HeartPulse,
  Landmark,
  RadioTower,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ChatWidget } from '@/components/ChatWidget';

export const metadata: Metadata = { title: 'Solutions' };

const industries = [
  ['Financial Services', Banknote, 'Automate KYC, credit decisions, reconciliations and regulatory reporting.', 'financial-services'],
  ['Insurance', BriefcaseBusiness, 'Orchestrate claims, underwriting and policy servicing with explainable AI.', 'insurance'],
  ['Healthcare', HeartPulse, 'Connect patient operations and clinical workflows with strong data controls.', 'healthcare'],
  ['Logistics & Supply Chain', Truck, 'See every handoff from sourcing and inventory to last-mile delivery.', 'logistics'],
  ['Telecommunications', RadioTower, 'Coordinate network operations, service assurance and customer care.', 'telecommunications'],
  ['Retail', ShoppingBag, 'Unify orders, inventory, suppliers and customer engagement.', 'retail'],
  ['Public Sector', Landmark, 'Modernize citizen services with auditable, inclusive automation.', 'public-sector'],
  ['Energy & Utilities', Fuel, 'Automate field operations, metering, maintenance and compliance.', 'energy'],
  ['Manufacturing', Factory, 'Connect shop-floor signals to planning, quality and vendor operations.', 'manufacturing'],
] as const;

export default function SolutionsPage() {
  return <><Header /><main>
    <section className="page-hero"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Solutions by industry</p><h1>Start with the work that matters.</h1><p>Combine workflow orchestration, AI agents and African market context to solve the operations generic automation leaves behind.</p><div className="hero-actions"><Link className="btn btn-dark" href="#industries">Explore industries</Link><Link className="btn btn-light" href="/app/canvas">Build a custom flow <ArrowRight size={15} /></Link></div></div></section>

    <section className="section section-paper" id="industries"><div className="container"><div className="section-head"><div><p className="eyebrow"><span className="eyebrow-dot" /> Industry blueprints</p><h2 className="h2">Begin in your world.</h2></div><p className="lede">Production patterns shaped around sector controls, vocabulary and operating realities.</p></div><div className="solutions-grid">{industries.map(([title, Icon, copy, slug], index) => <article className="solution-card" key={title}><div className="solution-card-meta"><span>{String(index + 1).padStart(2, '0')}</span><span className="solution-card-icon"><Icon size={19} /></span></div><h3>{title}</h3><p>{copy}</p><Link href={`/app/canvas?solution=${slug}`}>Start with this blueprint <ArrowRight size={13} /></Link></article>)}</div></div></section>

    <section className="section section-ink"><div className="container"><div className="section-head"><div><p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Solution path</p><h2 className="h2">From operating pain<br />to measured outcome.</h2></div><p className="lede">Every engagement follows a clear route with an owner, a control point and a visible result.</p></div><div className="journey">{[
      ['01', 'Frame the outcome', 'Define the decision, handoff or cycle time that needs to improve.'],
      ['02', 'Map the real route', 'Capture happy paths, exceptions, local context and human judgment.'],
      ['03', 'Prove it safely', 'Test with production-shaped data and explicit approval gates.'],
      ['04', 'Scale the pattern', 'Measure, version and reuse what works across teams and markets.'],
    ].map(([number, title, copy]) => <article className="journey-step" key={number}><span className="step-num">{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

    <section className="section section-amber closing-section"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Your process, not a generic demo</p><h2 className="h2">Bring the messy version.<br />We will map the useful one.</h2><div className="hero-actions"><Link className="btn btn-dark" href="/app/canvas">Open Visual Canvas <ArrowRight size={15} /></Link><Link className="btn btn-light" href="/company">Talk to a solutions expert</Link></div></div></section>
  </main><Footer /><ChatWidget /></>;
}
