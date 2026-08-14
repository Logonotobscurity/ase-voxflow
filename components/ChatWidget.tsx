'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Mic, MicOff, Send, Sparkles, X } from 'lucide-react';

type Message = { role: 'assistant'|'user'; text: string };

export function ChatWidget() {
  const [open,setOpen]=useState(false); const [voice,setVoice]=useState(false); const [typing,setTyping]=useState(false);
  const [value,setValue]=useState(''); const [messages,setMessages]=useState<Message[]>([{role:'assistant',text:'Hello — I’m Ayo, your Ase workflow guide. Tell me what you want to automate.'}]);
  const panel=useRef<HTMLDivElement>(null); const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{const fn=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('keydown',fn);return()=>document.removeEventListener('keydown',fn)},[]);
  useEffect(()=>{if(open) setTimeout(()=>input.current?.focus(),80)},[open]);
  function send(e?:FormEvent, preset?:string){e?.preventDefault();const text=(preset??value).trim();if(!text)return;setMessages(m=>[...m,{role:'user',text}]);setValue('');setTyping(true);setTimeout(()=>{setTyping(false);setMessages(m=>[...m,{role:'assistant',text:text.toLowerCase().includes('vendor')?'I found 12 preferred logistics vendors in Lagos. I can add a Vendor Lookup node and a risk threshold to your canvas.':'I’ve drafted that as a workflow. Would you like me to open it in Visual Canvas for review?'}])},850)}
  return <>
    {open && <div className="chat-panel" role="dialog" aria-modal="true" aria-label="Ase assistant" ref={panel}>
      <div className="chat-head"><span className="agent-avatar"><Bot size={19}/></span><div className="chat-head-copy"><strong>Ayo · Ase guide</strong><span>Online · usually replies instantly</span></div><button onClick={()=>setVoice(v=>!v)} aria-label={voice?'Turn voice off':'Turn voice on'}>{voice?<Mic size={16}/>:<MicOff size={16}/>}</button><button onClick={()=>setOpen(false)} aria-label="Close assistant"><X size={17}/></button></div>
      <div className="chat-badges"><span className="tag tag-cyan">WebRTC live</span><span className="tag tag-purple">Whisper STT</span>{voice&&<span className="tag tag-green"><span className="mini-wave">{[5,12,8,15,7].map((h,i)=><i key={i} style={{'--m':`${h}px`} as React.CSSProperties}/>)}</span> Listening</span>}</div>
      <div className="chat-messages" aria-live="polite">{messages.map((m,i)=><div className={`msg ${m.role==='user'?'user':''}`} key={i}>{m.text}</div>)}{typing&&<div className="msg typing" aria-label="Assistant is typing"><i/><i/><i/></div>}</div>
      <div className="chat-suggest"><button onClick={()=>send(undefined,'Build a vendor onboarding flow')}>Vendor onboarding</button><button onClick={()=>send(undefined,'Connect Gmail to Notion')}>Connect my tools</button><button onClick={()=>send(undefined,'Show workflow examples')}>See examples</button></div>
      <form className="chat-input" onSubmit={send}><input ref={input} value={value} onChange={e=>setValue(e.target.value)} placeholder="Describe a workflow…" aria-label="Message"/><button aria-label="Send message"><Send size={15}/></button></form>
    </div>}
    <button className="chat-launcher" aria-label={open?'Close Ase assistant':'Talk to Ase assistant'} onClick={()=>setOpen(v=>!v)}>{open?<X size={21}/>:<><Sparkles size={22}/><span className="launcher-badge"/></>}</button>
  </>;
}
