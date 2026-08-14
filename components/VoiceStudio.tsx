'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, AudioLines, Copy, Mic2, PhoneOff, Play, Video } from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';

const bars = [20, 38, 66, 32, 92, 56, 105, 48, 86, 34, 70, 99, 44, 82, 62, 28, 74, 46, 88, 36, 68, 96, 51];
const styles = ['Aura', 'Wave', 'Radial', 'Grid', 'Bar'] as const;
const states = ['connecting', 'listening', 'speaking', 'thinking'] as const;

type VisualStyle = (typeof styles)[number];
type AgentState = (typeof states)[number];

export function VoiceStudio() {
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('Aura');
  const [agentState, setAgentState] = useState<AgentState>('listening');
  const [live, setLive] = useState(true);
  const [camera, setCamera] = useState(false);
  const [hue, setHue] = useState('#ffcc33');
  const [copied, setCopied] = useState(false);
  const code = `<AgentAudioVisualizer${visualStyle} state="${agentState}" />`;

  async function copyCode() {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <><Header /><main>
    <section className="page-hero voice-studio-hero"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Agent voice studio</p><h1>Give your agent a visual personality.</h1><p>Prototype visual voice states with responsive visualizers, scripted transcript blocks and interface-only media controls. No live media transport is connected.</p><div className="hero-actions"><Link className="btn btn-dark" href="#designer">Design a visualizer</Link><Link className="btn btn-light" href="/app/canvas?template=voice-agent">Add to a workflow <ArrowRight size={15} /></Link></div></div></section>

    <section className="section section-cream" id="designer"><div className="container"><div className="section-head"><div><p className="eyebrow"><span className="eyebrow-dot" /> Visual state designer</p><h2 className="h2">Make every agent state legible.</h2></div><p className="lede">Choose a surface, state and signal colour. The preview updates immediately and remains understandable beyond animation alone.</p></div><div className="personality voice-designer">
      <div className="voice-controls"><fieldset><legend className="panel-label">Visualizer style</legend><div className="style-pills">{styles.map((item) => <button aria-pressed={visualStyle === item} className={`style-pill ${visualStyle === item ? 'active' : ''}`} key={item} onClick={() => setVisualStyle(item)}>{item}</button>)}</div></fieldset>
        <div className="prop-block voice-state-controls"><div className="prop-block-title">Agent state</div><div className="module-tabs">{states.map((item) => <button aria-pressed={agentState === item} className={`module-tab ${agentState === item ? 'active' : ''}`} key={item} onClick={() => setAgentState(item)}>{item}</button>)}</div><label className="field-label" htmlFor="voice-hue">Signal colour</label><div className="color-input-row"><input id="voice-hue" aria-label="Signal colour picker" type="color" value={hue} onChange={(event) => setHue(event.target.value)} /><input className="field" aria-label="Signal colour hexadecimal value" value={hue} onChange={(event) => setHue(event.target.value)} /></div><label className="field-label" htmlFor="voice-shift">Colour shift</label><input id="voice-shift" type="range" min="0" max="1" step=".1" defaultValue=".3" /></div>
        <div className="voice-callout"><AudioLines size={20} /><p><strong>Integration target</strong>The visual states are accessible beyond colour; WebRTC and agent-state event wiring are not implemented.</p></div>
      </div>

      <div className="personality-preview voice-visual-preview" style={{'--voice-hue': hue} as React.CSSProperties}><div className="console-top"><span className="status-line"><i className="live-dot" /> {visualStyle} · {agentState}</span><span className="tag tag-ink">Preview</span></div>{visualStyle === 'Aura' ? <div className="aura"><div className="aura-center" /></div> : <div className={`spectrum spectrum-${visualStyle.toLowerCase()}`}>{bars.map((height, index) => <span key={index} style={{'--h': `${visualStyle === 'Bar' ? height : height * .8}px`, '--i': index, background: hue} as React.CSSProperties} />)}</div>}<div className="preview-code"><span>{code}</span><button className="copy-btn" onClick={copyCode} aria-label="Copy component code"><Copy size={14} /></button><em aria-live="polite">{copied ? 'Copied' : ''}</em></div></div>
    </div></div></section>

    <section className="section section-ink"><div className="container"><div className="section-head"><div><p className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Session simulator</p><h2 className="h2">Inspect a scripted exchange.</h2></div><p className="lede">Review transcript hierarchy, animated feedback and media-control states in an accessible interface simulation.</p></div><div className="voice-console voice-session"><div className="console-top"><div className="ai-top"><span className="ai-icon"><Mic2 size={14} /></span>Ayo · Vendor assistant</div><span className={`tag ${live ? 'tag-green' : 'tag-orange'}`}>{live ? 'Simulation active' : 'Simulation paused'}</span></div><div className="spectrum voice-session-spectrum">{bars.map((height, index) => <span key={index} style={{'--h': `${live ? height : 8}px`, '--i': index} as React.CSSProperties} />)}</div><div className="voice-transcript"><div className="msg">Hi, how can I help with vendor operations today?</div><div className="msg user">Show my preferred logistics vendors in Lagos.</div><div className="msg">In this scripted example, TransWest Africa has the highest sample score.</div></div><div className="console-actions voice-media-controls"><button aria-pressed={camera} className={`btn btn-icon btn-outline-light ${camera ? 'is-on' : ''}`} onClick={() => setCamera((value) => !value)} aria-label={camera ? 'Disable camera preview state' : 'Enable camera preview state'}><Video size={16} /></button><button className="mic-orb" onClick={() => setLive((value) => !value)} aria-label={live ? 'Pause voice simulation' : 'Resume voice simulation'}>{live ? <Mic2 size={22} /> : <Play size={22} />}</button><button className="btn btn-icon btn-outline-light" onClick={() => setLive(false)} aria-label="End voice simulation"><PhoneOff size={16} /></button></div></div></div></section>
  </main><Footer /></>;
}
