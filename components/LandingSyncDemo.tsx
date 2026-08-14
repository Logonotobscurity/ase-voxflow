'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  GitBranch,
  Mic2,
  Pause,
  Play,
  RotateCcw,
  ShoppingCart,
  Store,
} from 'lucide-react';

const steps = [
  { label: 'Start', detail: 'Procurement request', icon: Play },
  { label: 'Voice trigger', detail: 'Text-first command', icon: Mic2 },
  { label: 'Vendor lookup', detail: 'Preferred · Lagos', icon: Store },
  { label: 'Approval condition', detail: 'Finance review', icon: GitBranch },
  { label: 'Purchase order', detail: 'Bounded result', icon: ShoppingCart },
] as const;

const mobileMessages = [
  'Start a preferred-vendor procurement flow.',
  'Show preferred logistics vendors in Lagos.',
  'Matched the request to the vendor lookup step.',
  'Finance approval is required before the order.',
  'Flow assembled. Review it in Visual Canvas.',
];

export function LandingSyncDemo() {
  const [activeStep, setActiveStep] = useState(1);
  const [selectedStep, setSelectedStep] = useState(1);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (activeStep >= steps.length - 1) {
        setPlaying(false);
        return;
      }
      const next = activeStep + 1;
      setActiveStep(next);
      setSelectedStep(next);
    }, 1250);
    return () => window.clearTimeout(timer);
  }, [activeStep, playing]);

  const togglePlayback = () => {
    if (activeStep === steps.length - 1) {
      setActiveStep(0);
      setSelectedStep(0);
    }
    setPlaying((current) => !current);
  };

  const reset = () => {
    setPlaying(false);
    setActiveStep(0);
    setSelectedStep(0);
  };

  const selected = steps[selectedStep];
  const status = playing ? 'Updating shared state' : activeStep === steps.length - 1 ? 'Ready to review' : 'Paused';

  return (
    <div className="sync-demo" aria-label="Interactive synchronized procurement workflow demonstration">
      <div className="sync-demo-bar am-dots">
        <span className="am-lights" aria-hidden="true" />
        <span>ase · synchronized workflow</span>
        <span className="sync-demo-version">procurement v13 · demo</span>
      </div>

      <div className="sync-demo-stage">
        <section className="sync-desktop" aria-label="Desktop visual canvas">
          <div className="sync-desktop-bar">
            <div><strong>Voice → procurement</strong><span>Canonical canvas preview</span></div>
            <span className={`sync-status ${playing ? 'is-live' : ''}`}><i />{status}</span>
          </div>
          <div className="sync-desktop-body">
            <aside className="sync-peers" aria-label="Illustrative collaborators">
              <p>Team</p>
              <span><i className="peer peer-online">AM</i> Amara</span>
              <span><i className="peer peer-active">KO</i> Kofi</span>
              <span><i className="peer peer-agent">AS</i> Ase</span>
              <small>Presence is illustrative</small>
            </aside>
            <div className="sync-flow" style={{ '--sync-progress': activeStep / (steps.length - 1) } as React.CSSProperties}>
              <span className="sync-flow-line" aria-hidden="true"><i /></span>
              {steps.map((step, index) => {
                const Icon = step.icon;
                const state = index < activeStep ? 'is-complete' : index === activeStep ? 'is-active' : 'is-pending';
                return (
                  <button
                    type="button"
                    className={`sync-step ${state} ${selectedStep === index ? 'is-selected' : ''}`}
                    key={step.label}
                    onClick={() => setSelectedStep(index)}
                    aria-pressed={selectedStep === index}
                  >
                    <span className="sync-step-index">{index < activeStep ? <Check size={12} /> : index + 1}</span>
                    <span className="sync-step-icon"><Icon size={14} /></span>
                    <span><strong>{step.label}</strong><small>{step.detail}</small></span>
                    {index === activeStep && <em>{playing ? 'running' : 'current'}</em>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sync-inspector" aria-live="polite">
            <span>Selected step {String(selectedStep + 1).padStart(2, '0')}</span>
            <strong>{selected.label}</strong>
            <small>{selected.detail} · inspectable demo state</small>
          </div>
        </section>

        <div className={`sync-signal ${playing ? 'is-moving' : ''}`} aria-hidden="true"><i /><i /><i /></div>

        <section className="sync-phone am-dots" aria-label="Mobile voice client preview">
          <div className="sync-phone-shell">
            <span className="sync-phone-notch" aria-hidden="true" />
            <div className="sync-phone-top"><span>9:41</span><span className="sync-phone-presence"><i /><i /><i /></span></div>
            <p className="sync-phone-label">Ase command · text fallback</p>
            <div className="sync-phone-copy">
              <p>“{mobileMessages[Math.min(activeStep, mobileMessages.length - 1)]}”</p>
              <span>{playing ? 'Updating the shared canvas…' : status}<i className="cursor" /></span>
            </div>
            <div className={`sync-wave ${playing ? 'is-live' : ''}`} aria-hidden="true">
              {Array.from({ length: 16 }).map((_, index) => <i key={index} style={{ '--wave-delay': `${index * 0.055}s`, '--wave-size': `${7 + (index % 5) * 3}px` } as React.CSSProperties} />)}
            </div>
            <button type="button" className="sync-mic" aria-label="Scripted voice visualization; no microphone is connected" onClick={togglePlayback}>
              {playing ? <Pause size={17} /> : <Mic2 size={17} />}
            </button>
          </div>
        </section>
      </div>

      <div className="sync-demo-controls">
        <div className="sync-playback" role="group" aria-label="Workflow demonstration controls">
          <button type="button" onClick={togglePlayback}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : 'Play'}</button>
          <button type="button" onClick={reset}><RotateCcw size={15} />Reset</button>
        </div>
        <p aria-live="polite">Step {activeStep + 1} of {steps.length} · {status}</p>
        <Link href="/app/canvas?template=vendor-registration">Open this workflow <ArrowRight size={14} /></Link>
      </div>
    </div>
  );
}
