'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';

type Message = { role: 'assistant' | 'user'; text: string };

const starterMessages = [
  'Build a vendor onboarding flow',
  'Add a finance approval gate',
  'Show workflow examples',
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hello — I’m the scripted Ase preview. Describe a workflow and I’ll show how a guided handoff could work.' },
  ]);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const hadOpened = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && open) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    let focusTimer: number | undefined;
    if (open) {
      hadOpened.current = true;
      focusTimer = window.setTimeout(() => input.current?.focus(), 60);
    } else if (hadOpened.current) {
      launcher.current?.focus();
    }
    return () => { if (focusTimer) window.clearTimeout(focusTimer); };
  }, [open]);

  function containFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const targets = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])');
    if (!targets?.length) return;
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function send(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const text = (preset ?? value).trim();
    if (!text || typing) return;
    setMessages((current) => [...current, { role: 'user', text }]);
    setValue('');
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((current) => [...current, {
        role: 'assistant',
        text: text.toLowerCase().includes('vendor')
          ? 'In this scripted preview, I would place a Vendor Lookup node before an explicit finance approval gate. Open Visual Canvas to build and review the graph.'
          : 'This scripted response can hand you off to Visual Canvas for review. It has not run an agent, called an integration, or changed an external system.',
      }]);
    }, 750);
  }

  return (
    <>
      {open && <div className="chat-backdrop" aria-hidden="true" onPointerDown={() => setOpen(false)} />}
      {open && (
        <div className="chat-panel" id="ase-preview-panel" role="dialog" aria-modal="true" aria-labelledby="ase-preview-title" ref={panel} onKeyDown={containFocus}>
          <div className="chat-head">
            <span className="agent-avatar"><Bot size={19} /></span>
            <div className="chat-head-copy"><strong id="ase-preview-title">Ase workflow guide</strong><span><i /> Ready · scripted preview</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Ask Ase"><X size={17} /></button>
          </div>
          <div className="chat-disclosure"><Sparkles size={14} /><p><strong>Interaction preview only.</strong> Replies are scripted; no LLM, microphone, integration, or autonomous execution is connected here.</p></div>
          <div className="chat-messages" aria-live="polite">
            {messages.map((message, index) => <div className={`msg ${message.role === 'user' ? 'user' : ''}`} key={`${message.role}-${index}`}>{message.text}</div>)}
            {typing && <div className="msg typing" aria-label="Ase preview is responding"><i /><i /><i /></div>}
          </div>
          <div className="chat-suggest" aria-label="Example prompts">
            {starterMessages.map((message) => <button type="button" key={message} onClick={() => send(undefined, message)} disabled={typing}>{message}</button>)}
          </div>
          <form className="chat-input" onSubmit={send}>
            <input ref={input} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Describe a workflow…" aria-label="Describe a workflow" />
            <button type="submit" aria-label="Send message" disabled={!value.trim() || typing}><Send size={15} /></button>
          </form>
          <a className="chat-canvas-link" href="/app/canvas">Continue in Visual Canvas →</a>
        </div>
      )}
      <button
        type="button"
        ref={launcher}
        className="chat-launcher"
        aria-expanded={open}
        aria-controls="ase-preview-panel"
        aria-label={open ? 'Close Ask Ase' : 'Open Ask Ase scripted preview'}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="launcher-ready" aria-hidden="true" />
        <span className="launcher-copy"><small>Ready</small><strong>Ask Ase</strong></span>
        {open ? <X size={18} /> : <Sparkles size={18} />}
      </button>
    </>
  );
}
