'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CirclePlay,
  GitBranch,
  Landmark,
  Mic2,
  PackageCheck,
  Play,
  ScanText,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';
import { ChatWidget } from './ChatWidget';
import { VideoPreview } from './VideoPreview';
import { AseSystemDiagram } from './AseSystemDiagram';

const Fade = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-60px' }}
    transition={{ duration: 0.18, delay }}
  >
    {children}
  </motion.div>
);

const spectrum = [20, 44, 70, 34, 92, 58, 108, 46, 122, 75, 55, 95, 42, 112, 70, 32, 83, 49, 103, 64, 28, 72, 39];

const useCases = {
  vendors: {
    label: 'Vendor operations',
    title: 'Move from supplier request to approved purchase order.',
    copy: 'The current demo models vendor lookup, risk, approval and purchase-order stages without calling external vendor or ERP systems.',
    icon: Store,
    stat: 'DEMO',
    statLabel: 'illustrative vendor journey',
    steps: ['Capture request', 'Verify supplier', 'Route approval', 'Monitor delivery'],
    href: '/app/vendors',
  },
  finance: {
    label: 'Finance controls',
    title: 'Make approvals faster without making controls weaker.',
    copy: 'The P0 policy layer demonstrates role checks, separation of duties and explicit approval records with correlated events.',
    icon: Landmark,
    stat: 'POLICY',
    statLabel: 'explicit approval controls',
    steps: ['Read invoice', 'Match policy', 'Escalate exception', 'Post decision'],
    href: '/solutions',
  },
  field: {
    label: 'Field operations',
    title: 'Model work that may lose the network.',
    copy: 'This interface previews the intended offline field journey; local queues and synchronization transports are not yet integrated.',
    icon: Truck,
    stat: 'TARGET',
    statLabel: 'offline queue pattern, not integrated',
    steps: ['Receive job', 'Work offline', 'Capture evidence', 'Sync outcome'],
    href: '/solutions',
  },
  service: {
    label: 'Customer service',
    title: 'Preview the route from conversation to proposed action.',
    copy: 'This interface previews multilingual service commands; speech recognition, retrieval and customer-channel adapters are not yet integrated.',
    icon: Users,
    stat: 'PREVIEW',
    statLabel: 'language UI targets, provider unverified',
    steps: ['Listen', 'Understand intent', 'Resolve or route', 'Confirm action'],
    href: '/app/voice',
  },
} as const;

type UseCaseKey = keyof typeof useCases;

export function HomePage() {
  const [activeCase, setActiveCase] = useState<UseCaseKey>('vendors');
  const current = useCases[activeCase];
  const CurrentIcon = current.icon;

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <motion.div className="hero-kicker" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                <span>Preview</span> Voice-to-workflow for African operations <ChevronRight size={13} />
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                Make the way your business works <span className="gradient-word">runnable.</span>
              </motion.h1>
              <p>
                Ase turns operating knowledge into visible workflow graphs. Shape the work on the VOXFLOW canvas, then verify bounded demo execution, evidence and approval states through one canonical contract.
              </p>
              <div className="hero-actions">
                <Link href="/app/canvas" className="btn btn-dark">Build a workflow <ArrowRight size={16} /></Link>
                <Link href="/platform" className="btn btn-light"><CirclePlay size={16} /> See how it works</Link>
              </div>
              <div className="hero-note" aria-label="Product benefits">
                <span><i /> Explore without a card</span>
                <span><i /> Emit correlated demo evidence</span>
                <span><i /> External adapters stay fail-closed</span>
              </div>
            </div>

            <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, delay: 0.04 }}>
              <div className="orb-stage" aria-hidden="true">
                <div className="orb-glow" />
                <div className="orbit">
                  <span className="integration-chip chip-1">INPUT</span>
                  <span className="integration-chip chip-2">GRAPH</span>
                  <span className="integration-chip chip-3">POLICY</span>
                  <span className="integration-chip chip-4">EVIDENCE</span>
                  <span className="integration-chip chip-5">HUMAN</span>
                </div>
                <div className="orb"><div className="orb-lines" /><span className="orb-core">ASE</span></div>
              </div>
              <div className="floating-card snippet-card">
                <span className="float-label">Illustrative workflow</span>
                <div className="code-row"><i className="code-dot" /> voice.request</div>
                <div className="code-row"><i className="code-dot amber" /> risk.score &lt; 40</div>
                <div className="code-row"><i className="code-dot green" /> finance.approve</div>
              </div>
              <div className="floating-card ai-card">
                <div className="ai-top"><span className="ai-icon"><Bot size={15} /></span>Illustrative Ase assist</div>
                <p>I added a control gate before the purchase order is created.</p>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="proof-strip" aria-label="Product capability summary">
          <div className="container proof-inner">
            <p>One operating layer for teams building across African markets.</p>
            <div className="logo-row">
              {['VOICE', 'WORKFLOWS', 'VENDORS', 'AGENTS', 'CONTROLS'].map((label, index) => (
                <span className="fake-logo" key={label}><i>{String(index + 1).padStart(2, '0')}</i>{label}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-paper">
          <div className="container">
            <Fade className="section-head">
              <div><p className="eyebrow"><span className="eyebrow-dot" /> The operating fabric</p><h2 className="h2">One canonical graph.<br />Every modelled handoff in view.</h2></div>
              <p className="lede">The current VOXFLOW demo keeps workflow structure, policy stops and execution evidence on one inspectable contract.</p>
            </Fade>
            <div className="system-story-grid">
              <Fade className="system-diagram-wrap"><AseSystemDiagram /></Fade>
              <div className="system-principles">
                {[
                  ['01', 'Capture the process', 'Start with an illustrative voice request, an event-shaped trigger or a curated demo blueprint.', Mic2],
                  ['02', 'Make decisions inspectable', 'Conditions, approval gates and proposed tool or agent steps remain visible; each save versions the workflow.', GitBranch],
                  ['03', 'Run with control', 'Validate and run deterministic demo handlers, then stop explicitly when human approval is required.', ShieldCheck],
                ].map(([n, title, copy, Icon], index) => (
                  <Fade delay={index * 0.04} key={title as string}>
                    <article className="principle-row">
                      <span className="principle-number">{n as string}</span>
                      <span className="principle-icon"><Icon size={19} /></span>
                      <div><h3>{title as string}</h3><p>{copy as string}</p></div>
                    </article>
                  </Fade>
                ))}
                <Link href="/platform" className="text-link">Explore the complete platform <ArrowRight size={15} /></Link>
              </div>
            </div>
            <Fade><div className="stats-ribbon"><div className="stat"><strong>1</strong><span>canonical workflow graph</span></div><div className="stat"><strong>5</strong><span>bounded agent limits</span></div><div className="stat"><strong>22</strong><span>passing automated tests</span></div><div className="stat"><strong>0</strong><span>external demo side effects</span></div></div></Fade>
          </div>
        </section>

        <section className="section section-ink">
          <div className="container">
            <Fade className="section-head">
              <div><p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Start with an outcome</p><h2 className="h2">Choose the work.<br />Ase maps the route.</h2></div>
              <p className="lede">Explore a complete journey instead of a disconnected list of features.</p>
            </Fade>
            <div className="outcome-tabs" role="tablist" aria-label="Solution journeys">
              {(Object.entries(useCases) as [UseCaseKey, typeof useCases[UseCaseKey]][]).map(([key, item]) => (
                <button key={key} role="tab" aria-selected={activeCase === key} className={`outcome-tab ${activeCase === key ? 'active' : ''}`} onClick={() => setActiveCase(key)}>
                  <item.icon size={18} /> {item.label}
                </button>
              ))}
            </div>
            <div className="outcome-panel" role="tabpanel">
              <div className="outcome-copy">
                <span className="outcome-icon"><CurrentIcon size={25} /></span>
                <h3>{current.title}</h3>
                <p>{current.copy}</p>
                <Link href={current.href} className="btn btn-amber">Explore this solution <ArrowRight size={15} /></Link>
              </div>
              <div className="outcome-route" aria-label={`${current.label} workflow stages`}>
                {current.steps.map((step, index) => (
                  <div className="route-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong>{index < current.steps.length - 1 && <i aria-hidden="true" />}</div>
                ))}
              </div>
              <div className="outcome-stat"><strong>{current.stat}</strong><span>{current.statLabel}</span></div>
            </div>
          </div>
        </section>

        <section className="section section-paper voice-section" id="voice">
          <div className="container voice-grid">
            <Fade>
              <p className="eyebrow"><span className="eyebrow-dot" /> Voice-first by design</p>
              <h2 className="h2">Model natural commands.<br />Review precise proposals.</h2>
              <p className="lede">This demo shows the intended multilingual interaction and governed command flow. Speech providers, accent performance and offline transport remain unverified.</p>
              <div className="language-list" aria-label="Target language previews">{['English', 'Kiswahili', 'Yorùbá', 'Hausa', 'Amharic', 'isiZulu', 'French', 'Portuguese'].map((x) => <span className="lang" key={x}>{x}</span>)}</div>
              <Link className="text-link" href="/app/voice">Open Voice Studio <ArrowRight size={15} /></Link>
            </Fade>
            <Fade delay={0.05}>
              <div className="voice-console">
                <div className="console-top"><span className="status-line"><i className="live-dot" /> Scripted sample · English (Nigeria)</span><span className="tag tag-amber">DEMO</span></div>
                <div className="spectrum">{spectrum.map((h, i) => <span key={i} style={{ '--h': `${h}px`, '--i': i } as React.CSSProperties} />)}</div>
                <div className="transcript"><span className="transcript-label">Example transcript</span><p>“Find preferred packaging suppliers in Port Harcourt, check risk, then route a ₦2.5 million approval.”<i className="cursor" /></p></div>
                <div className="console-actions"><button className="mic-orb" aria-label="Audio replay is not connected" disabled><Mic2 size={23} /></button></div>
                <div className="voice-capabilities"><div className="mini-cap"><strong>Accent target</strong><span>Provider performance is not yet verified.</span></div><div className="mini-cap"><strong>Offline target</strong><span>Queue transport is not yet integrated.</span></div><div className="mini-cap"><strong>Action-bound</strong><span>Server commands remain governed proposals.</span></div></div>
              </div>
            </Fade>
          </div>
        </section>

        <section className="section section-cream" id="canvas">
          <div className="container">
            <Fade className="section-head">
              <div><p className="eyebrow"><span className="eyebrow-dot" /> Visual Canvas</p><h2 className="h2">Flow is the interface.</h2></div>
              <p className="lede">Business teams can understand it. Technical teams can extend it. Everyone can see what happens next.</p>
            </Fade>
            <Fade><WorkflowPreview /></Fade>
            <div className="workflow-cta"><Link className="btn btn-dark" href="/app/canvas">Open the canvas <ArrowRight size={15} /></Link></div>
          </div>
        </section>

        <section className="section section-paper">
          <div className="container market-split">
            <Fade>
              <p className="eyebrow"><span className="eyebrow-dot" /> Marketplace</p>
              <h2 className="h2">Do not start from zero.</h2>
              <p className="lede">Open a curated agent concept, connector target or demo blueprint, then adapt the graph to your controls and market.</p>
              <Link className="btn btn-dark" href="/marketplace">Browse the marketplace <ArrowRight size={15} /></Link>
            </Fade>
            <div className="market-card-grid">
              {[
                ['Agents', 'Service and operations intelligence', Bot, 'Concepts'],
                ['Blueprints', 'Reusable, governed process flows', Workflow, 'Demo flows'],
                ['Connectors', 'Enterprise and local systems', Boxes, 'Targets'],
                ['Vendor Ops', 'Sourcing, risk and purchasing', PackageCheck, 'Preview'],
              ].map(([title, text, Icon, count], index) => (
                <Fade delay={index * 0.04} key={title as string}>
                  <Link href="/marketplace" className="market-card">
                    <div className="market-card-top"><span className="market-card-icon"><Icon size={18} /></span><ArrowRight size={16} /></div>
                    <h3>{title as string}</h3><p>{text as string}</p><span className="tag tag-amber">{count as string}</span>
                  </Link>
                </Fade>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-ink closing-section">
          <div className="container">
            <Fade>
              <p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> A clearer next step</p>
              <h2 className="h2">Take one process.<br />Make it work end to end.</h2>
              <p className="lede">Build the first draft now, or explore the platform architecture with your team.</p>
              <div className="hero-actions"><Link className="btn btn-amber" href="/app/canvas">Start building <ArrowRight size={15} /></Link><Link className="btn btn-outline-light" href="/company">Talk to a solutions expert</Link></div>
            </Fade>
          </div>
        </section>
      </main>
      <Footer />
      <ChatWidget />
      <VideoPreview />
    </>
  );
}

function WorkflowPreview() {
  return (
    <div className="workflow-shell">
      <aside className="workflow-sidebar">
        <p className="panel-label">Node palette</p>
        <div className="node-chip"><i /> Start trigger</div>
        <div className="node-chip voice"><i /> Voice command</div>
        <div className="node-chip"><i /> Condition</div>
        <div className="node-chip vendor"><i /> Vendor lookup</div>
        <div className="node-chip"><i /> Send approval</div>
      </aside>
      <div className="workflow-canvas">
        <div className="canvas-toolbar"><button className="canvas-tool" aria-label="Preview only: zoom is unavailable" disabled><ZoomIn size={14} /></button><button className="canvas-tool" aria-label="Preview only: zoom is unavailable" disabled><ZoomOut size={14} /></button><button className="canvas-tool" aria-label="Preview only: run is unavailable" disabled><Play size={14} /></button></div>
        <svg className="edge-svg" viewBox="0 0 800 590" preserveAspectRatio="none" aria-hidden="true"><path className="edge-path active" d="M115,176 C200,176 205,120 295,120" /><path className="edge-path" d="M425,120 C500,120 480,260 570,260" /><path className="edge-path active" d="M635,290 C635,380 530,390 530,470" /><path className="edge-path" d="M425,120 C445,120 380,300 310,335" /><path className="edge-path" d="M310,365 C310,450 395,470 460,470" /></svg>
        <div className="demo-node" style={{ left: '6%', top: '25%' }}><span className="node-ico"><CirclePlay size={13} /></span><strong>New request</strong><span>Voice or form</span></div>
        <div className="demo-node voice" style={{ left: '35%', top: '14%' }}><span className="node-ico"><ScanText size={13} /></span><strong>Understand intent</strong><span>Scripted text · Nigeria</span></div>
        <div className="demo-node vendor" style={{ right: '7%', top: '41%' }}><span className="node-ico"><Store size={13} /></span><strong>Vendor lookup</strong><span>Preferred · Rivers</span></div>
        <div className="demo-node" style={{ left: '31%', top: '55%' }}><span className="node-ico"><GitBranch size={13} /></span><strong>Risk gateway</strong><span>Score &lt; 40</span></div>
        <div className="demo-node end" style={{ left: '54%', bottom: '10%' }}><span className="node-ico"><Check size={13} /></span><strong>Create approval</strong><span>Finance approval stop</span></div>
        <span className="cursor-person" style={{ left: '50%', top: '32%' }}><em>Ada</em></span>
      </div>
      <aside className="workflow-props">
        <p className="panel-label">Properties</p>
        <div className="prop-section"><strong>Vendor lookup</strong><label className="field-label">Location</label><input className="field" value="Port Harcourt, NG" readOnly /><label className="field-label">Vendor tier</label><input className="field" value="Preferred" readOnly /></div>
        <div className="prop-section"><strong>Rules</strong><label className="field-label">Risk threshold</label><input className="field" value="Less than 40" readOnly /></div>
        <button className="btn btn-dark workflow-save" disabled aria-label="Preview only: save is unavailable">Save node</button>
      </aside>
    </div>
  );
}
