'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
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
  ShoppingCart,
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
    copy: 'Ase verifies documents, scores risk, routes approvals and keeps every handoff visible in one workflow.',
    icon: Store,
    stat: '68%',
    statLabel: 'less manual vendor follow-up',
    steps: ['Capture request', 'Verify supplier', 'Route approval', 'Monitor delivery'],
    href: '/app/vendors',
  },
  finance: {
    label: 'Finance controls',
    title: 'Make approvals faster without making controls weaker.',
    copy: 'Encode thresholds, segregation of duties and exception paths directly into an auditable operating flow.',
    icon: Landmark,
    stat: '3.1×',
    statLabel: 'faster approval cycles',
    steps: ['Read invoice', 'Match policy', 'Escalate exception', 'Post decision'],
    href: '/solutions',
  },
  field: {
    label: 'Field operations',
    title: 'Keep work moving when the network does not.',
    copy: 'Capture voice and task updates locally, queue them safely and synchronize the full record when teams reconnect.',
    icon: Truck,
    stat: '99.2%',
    statLabel: 'tasks captured across network states',
    steps: ['Receive job', 'Work offline', 'Capture evidence', 'Sync outcome'],
    href: '/solutions',
  },
  service: {
    label: 'Customer service',
    title: 'Turn every conversation into the next best action.',
    copy: 'Understand multilingual requests, retrieve context and trigger a governed workflow without forcing customers through menus.',
    icon: Users,
    stat: '8',
    statLabel: 'African languages in one experience',
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
                <span>New</span> Voice-to-workflow for African operations <ChevronRight size={13} />
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                Make the way your business works <span className="gradient-word">runnable.</span>
              </motion.h1>
              <p>
                Ase turns operational knowledge into visible, governed workflows. Describe the work, shape it on the VOXFLOW canvas, then run it across people, agents and systems.
              </p>
              <div className="hero-actions">
                <Link href="/app/canvas" className="btn btn-dark">Build a workflow <ArrowRight size={16} /></Link>
                <Link href="/platform" className="btn btn-light"><CirclePlay size={16} /> See how it works</Link>
              </div>
              <div className="hero-note" aria-label="Product benefits">
                <span><i /> Start without a card</span>
                <span><i /> Keep a complete audit trail</span>
                <span><i /> Work across network conditions</span>
              </div>
            </div>

            <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, delay: 0.04 }}>
              <div className="orb-stage" aria-hidden="true">
                <div className="orb-glow" />
                <div className="orbit">
                  <span className="integration-chip chip-1">VOICE</span>
                  <span className="integration-chip chip-2">SAP</span>
                  <span className="integration-chip chip-3">PAY</span>
                  <span className="integration-chip chip-4">CRM</span>
                  <span className="integration-chip chip-5">OPS</span>
                </div>
                <div className="orb"><div className="orb-lines" /><span className="orb-core">ASE</span></div>
              </div>
              <div className="floating-card snippet-card">
                <span className="float-label">Live workflow</span>
                <div className="code-row"><i className="code-dot" /> voice.request</div>
                <div className="code-row"><i className="code-dot amber" /> risk.score &lt; 40</div>
                <div className="code-row"><i className="code-dot green" /> finance.approve</div>
              </div>
              <div className="floating-card ai-card">
                <div className="ai-top"><span className="ai-icon"><Bot size={15} /></span>Ase assist</div>
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
              <div><p className="eyebrow"><span className="eyebrow-dot" /> The operating fabric</p><h2 className="h2">One source of truth.<br />Every handoff in view.</h2></div>
              <p className="lede">VOXFLOW connects what people say, what your rules require and what your systems need to do next.</p>
            </Fade>
            <div className="system-story-grid">
              <Fade className="system-diagram-wrap"><AseSystemDiagram /></Fade>
              <div className="system-principles">
                {[
                  ['01', 'Capture the real process', 'Start with a voice instruction, an event or a proven blueprint—not an empty technical canvas.', Mic2],
                  ['02', 'Make decisions inspectable', 'Conditions, people, agent actions and system calls stay visible and versioned.', GitBranch],
                  ['03', 'Run with control', 'Test, approve, execute and measure from the same governed workflow.', ShieldCheck],
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
            <Fade><div className="stats-ribbon"><div className="stat"><strong>60+</strong><span>integration nodes</span></div><div className="stat"><strong>8</strong><span>African languages</span></div><div className="stat"><strong>3×</strong><span>faster launches</span></div><div className="stat"><strong>1</strong><span>auditable operating view</span></div></div></Fade>
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
              <h2 className="h2">Speak naturally.<br />Build precisely.</h2>
              <p className="lede">Ase understands business vocabulary, regional accents and the context behind an instruction—even when connectivity is unreliable.</p>
              <div className="language-list">{['English', 'Kiswahili', 'Yorùbá', 'Hausa', 'Amharic', 'isiZulu', 'French', 'Portuguese'].map((x) => <span className="lang" key={x}>{x}</span>)}</div>
              <Link className="text-link" href="/app/voice">Open Voice Studio <ArrowRight size={15} /></Link>
            </Fade>
            <Fade delay={0.05}>
              <div className="voice-console">
                <div className="console-top"><span className="status-line"><i className="live-dot" /> Listening · English (Nigeria)</span><span className="tag tag-amber">LIVE</span></div>
                <div className="spectrum">{spectrum.map((h, i) => <span key={i} style={{ '--h': `${h}px`, '--i': i } as React.CSSProperties} />)}</div>
                <div className="transcript"><span className="transcript-label">Live transcript</span><p>“Find preferred packaging suppliers in Port Harcourt, check risk, then route a ₦2.5 million approval.”<i className="cursor" /></p></div>
                <div className="console-actions"><button className="mic-orb" aria-label="Pause listening"><Mic2 size={23} /></button></div>
                <div className="voice-capabilities"><div className="mini-cap"><strong>Accent-aware</strong><span>Understands real operating environments.</span></div><div className="mini-cap"><strong>Offline-ready</strong><span>Queues safely, then synchronizes.</span></div><div className="mini-cap"><strong>Action-bound</strong><span>Every command maps to a governed step.</span></div></div>
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
              <p className="lede">Install a proven agent, connector or process blueprint, then adapt it to your controls and market.</p>
              <Link className="btn btn-dark" href="/marketplace">Browse the marketplace <ArrowRight size={15} /></Link>
            </Fade>
            <div className="market-card-grid">
              {[
                ['Agents', 'Service and operations intelligence', Bot, '42 ready'],
                ['Blueprints', 'Reusable, governed process flows', Workflow, '68 flows'],
                ['Connectors', 'Enterprise and local systems', Boxes, '60+ nodes'],
                ['Vendor Ops', 'Sourcing, risk and purchasing', PackageCheck, '6 modules'],
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
        <div className="canvas-toolbar"><button className="canvas-tool" aria-label="Zoom in"><ZoomIn size={14} /></button><button className="canvas-tool" aria-label="Zoom out"><ZoomOut size={14} /></button><button className="canvas-tool" aria-label="Run workflow"><Play size={14} /></button></div>
        <svg className="edge-svg" viewBox="0 0 800 590" preserveAspectRatio="none" aria-hidden="true"><path className="edge-path active" d="M115,176 C200,176 205,120 295,120" /><path className="edge-path" d="M425,120 C500,120 480,260 570,260" /><path className="edge-path active" d="M635,290 C635,380 530,390 530,470" /><path className="edge-path" d="M425,120 C445,120 380,300 310,335" /><path className="edge-path" d="M310,365 C310,450 395,470 460,470" /></svg>
        <div className="demo-node" style={{ left: '6%', top: '25%' }}><span className="node-ico"><CirclePlay size={13} /></span><strong>New request</strong><span>Voice or form</span></div>
        <div className="demo-node voice" style={{ left: '35%', top: '14%' }}><span className="node-ico"><ScanText size={13} /></span><strong>Understand intent</strong><span>English · Nigeria</span></div>
        <div className="demo-node vendor" style={{ right: '7%', top: '41%' }}><span className="node-ico"><Store size={13} /></span><strong>Vendor lookup</strong><span>Preferred · Rivers</span></div>
        <div className="demo-node" style={{ left: '31%', top: '55%' }}><span className="node-ico"><GitBranch size={13} /></span><strong>Risk gateway</strong><span>Score &lt; 40</span></div>
        <div className="demo-node end" style={{ left: '54%', bottom: '10%' }}><span className="node-ico"><Check size={13} /></span><strong>Create approval</strong><span>Finance queue</span></div>
        <span className="cursor-person" style={{ left: '50%', top: '32%' }}><em>Ada</em></span>
      </div>
      <aside className="workflow-props">
        <p className="panel-label">Properties</p>
        <div className="prop-section"><strong>Vendor lookup</strong><label className="field-label">Location</label><input className="field" value="Port Harcourt, NG" readOnly /><label className="field-label">Vendor tier</label><input className="field" value="Preferred" readOnly /></div>
        <div className="prop-section"><strong>Rules</strong><label className="field-label">Risk threshold</label><input className="field" value="Less than 40" readOnly /></div>
        <button className="btn btn-dark workflow-save">Save node</button>
      </aside>
    </div>
  );
}
