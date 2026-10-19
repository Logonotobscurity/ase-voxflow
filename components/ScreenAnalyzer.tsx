'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageUp, Loader2, MonitorUp, RotateCcw, ScanEye, Sparkles, Square, X } from 'lucide-react';

type Analysis = {
  summary: string;
  context: string;
  observations: string[];
  automationOpportunities: { title: string; detail: string }[];
  answer?: string | null;
  model: string;
  analysedAt: string;
};

type Status = 'idle' | 'capturing' | 'analysing' | 'done' | 'error';

const MAX_EDGE = 1568;

/** Draws a video frame or image onto a canvas, downscaled, and returns a JPEG data URL. */
function toDataUrl(source: HTMLVideoElement | HTMLImageElement, width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function ScreenAnalyzer() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia);
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    const video = videoRef.current;
    if (status !== 'capturing' || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => undefined);
  }, [status]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus((current) => current === 'capturing' ? 'idle' : current);
  };

  const startShare = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', stopStream);
      setSnapshot(null);
      setAnalysis(null);
      setStatus('capturing');
    } catch (cause) {
      if ((cause as DOMException)?.name !== 'NotAllowedError') setError('Screen sharing could not start in this browser.');
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const image = toDataUrl(video, video.videoWidth, video.videoHeight);
    stopStream();
    setSnapshot(image);
    setStatus('idle');
    void analyse(image);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    setError(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const image = toDataUrl(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      setSnapshot(image);
      setAnalysis(null);
      setStatus('idle');
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError('That image could not be read.'); };
    img.src = url;
  };

  const analyse = async (image = snapshot) => {
    if (!image) return;
    setStatus('analysing');
    setError(null);
    try {
      const response = await fetch('/api/v1/screen/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, question: question.trim() || undefined }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? 'Analysis failed.');
      setAnalysis(body.data as Analysis);
      setStatus('done');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analysis failed.');
      setStatus('error');
    }
  };

  const reset = () => { stopStream(); setSnapshot(null); setAnalysis(null); setError(null); setStatus('idle'); };

  if (!open) {
    return (
      <button className="screen-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <ScanEye size={17} /> <span>Analyse a screen</span>
      </button>
    );
  }

  return (
    <section className="screen-panel" role="dialog" aria-modal="false" aria-labelledby="screen-panel-title">
      <header className="screen-panel-head">
        <span className="screen-panel-icon"><ScanEye size={17} /></span>
        <div><strong id="screen-panel-title">Screen analysis</strong><span>Share a screen or upload a screenshot</span></div>
        <button onClick={() => { stopStream(); setOpen(false); }} aria-label="Close screen analysis"><X size={16} /></button>
      </header>

      <div className="screen-panel-body">
        <div className={`screen-stage ${status === 'capturing' ? 'live' : ''}`}>
          {status === 'capturing' && <video ref={videoRef} muted playsInline aria-label="Live shared screen" />}
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
          {status !== 'capturing' && snapshot && <img src={snapshot} alt="Captured screen to analyse" />}
          {status !== 'capturing' && !snapshot && (
            <div className="screen-empty"><MonitorUp size={26} /><p>Nothing captured yet. Frames are only sent when you choose to analyse them, and are not stored.</p></div>
          )}
          {status === 'capturing' && <span className="screen-live-tag"><i /> LIVE</span>}
          {status === 'analysing' && <div className="screen-scan" aria-hidden="true" />}
        </div>

        <div className="screen-controls">
          {status === 'capturing' ? (
            <>
              <button className="btn btn-dark" onClick={captureFrame}><Sparkles size={15} /> Capture &amp; analyse</button>
              <button className="btn btn-light" onClick={stopStream}><Square size={14} /> Stop sharing</button>
            </>
          ) : (
            <>
              {canShare && <button className="btn btn-dark" onClick={startShare} disabled={status === 'analysing'}><MonitorUp size={15} /> Share screen</button>}
              <button className="btn btn-light" onClick={() => fileRef.current?.click()} disabled={status === 'analysing'}><ImageUp size={15} /> Upload screenshot</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
            </>
          )}
        </div>

        <label className="screen-question">
          <span>Ask about this screen (optional)</span>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1000} placeholder="e.g. Which steps here could be automated?" />
        </label>

        {snapshot && status !== 'capturing' && (
          <div className="screen-controls">
            <button className="btn btn-amber" onClick={() => analyse()} disabled={status === 'analysing'}>
              {status === 'analysing' ? <><Loader2 size={15} className="spin" /> Analysing…</> : <><Sparkles size={15} /> {analysis ? 'Analyse again' : 'Analyse'}</>}
            </button>
            <button className="btn btn-light" onClick={reset} disabled={status === 'analysing'}><RotateCcw size={14} /> Reset</button>
          </div>
        )}

        {error && <p className="screen-error" role="alert">{error}</p>}

        {analysis && (
          <div className="screen-result" aria-live="polite">
            <p className="screen-summary">{analysis.summary}</p>
            {analysis.answer && <div className="screen-answer"><strong>Answer</strong><p>{analysis.answer}</p></div>}
            <div><strong>Context</strong><p>{analysis.context}</p></div>
            {analysis.observations.length > 0 && <div><strong>Observations</strong><ul>{analysis.observations.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            {analysis.automationOpportunities.length > 0 && (
              <div><strong>Automation opportunities</strong>
                <ol className="screen-opportunities">{analysis.automationOpportunities.map((item) => <li key={item.title}><b>{item.title}</b><span>{item.detail}</span></li>)}</ol>
              </div>
            )}
            <small>Analysed by {analysis.model} · {new Date(analysis.analysedAt).toLocaleTimeString()}</small>
          </div>
        )}
      </div>
    </section>
  );
}
