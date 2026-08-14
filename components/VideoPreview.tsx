'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanEye, X } from 'lucide-react';

export function VideoPreview() {
  const [visible,setVisible]=useState(true);const [active,setActive]=useState(false);const [collapsed,setCollapsed]=useState(false);const [pos,setPos]=useState({x:24,y:24});
  const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const reset=()=>{setActive(true);setCollapsed(false);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{setActive(false);setCollapsed(true)},4500)};
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
  if(!visible)return null;
  return <div className={`video-preview ${active?'active':''} ${collapsed?'collapsed':''}`} style={{transform:`translate(${pos.x-24}px,${-(pos.y-24)}px)`}} onClick={reset}
    onPointerDown={e=>{reset();drag.current={x:e.clientX,y:e.clientY,px:pos.x,py:pos.y};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}}
    onPointerMove={e=>{if(!drag.current)return;const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y;if(dx<-130){setVisible(false);return}setPos({x:Math.max(8,drag.current.px+dx),y:Math.max(8,drag.current.py-dy)})}}
    onPointerUp={()=>drag.current=null} role="button" tabIndex={0} aria-label="Decorative screen-analysis demo. Drag to reposition, swipe left to dismiss.">
      <div className="video-scene"/><button className="video-close" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setVisible(false)}} aria-label="Dismiss video preview"><X size={13}/></button>
      <div className="video-overlay"><ScanEye size={11}/> Screen-analysis concept</div>{active&&<><i className="resize-dot r1"/><i className="resize-dot r2"/><i className="resize-dot r3"/><i className="resize-dot r4"/></>}
    </div>;
}
