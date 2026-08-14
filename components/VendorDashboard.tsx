'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Filter, Mic2, Plus, Search, ShieldCheck, ShoppingCart, TrendingUp, X } from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';

const vendors = [
  ['Kora Packaging Ltd.', 'Raw materials', 'Preferred', '96%', 'Active', 'Lagos'],
  ['TransWest Africa', 'Logistics', 'Preferred', '94%', 'Active', 'Lagos'],
  ['Nile Office Systems', 'Technology', 'Approved', '88%', 'Review', 'Abuja'],
  ['Sankofa Supplies', 'Facilities', 'Approved', '91%', 'Active', 'Accra'],
  ['Mazi Industrial Works', 'Manufacturing', 'Trial', '82%', 'Active', 'Aba'],
  ['Azania Cold Chain', 'Logistics', 'Preferred', '97%', 'Active', 'Johannesburg'],
] as const;

type Vendor = (typeof vendors)[number];
const tabs = ['Registration', 'Performance', 'Assessment', 'Purchase', 'Contracts', 'Risk'] as const;
const tabCopy: Record<(typeof tabs)[number], string> = {
  Registration: 'Verify and onboard suppliers through one controlled record.',
  Performance: 'Compare delivery, quality and responsiveness over time.',
  Assessment: 'Review evidence, capability and approvals before commitment.',
  Purchase: 'Move approved demand into purchase workflows and controls.',
  Contracts: 'Track commercial terms, owners and renewal moments.',
  Risk: 'Prioritise vendors that need intervention or updated evidence.',
};

export function VendorDashboard() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Registration');
  const [query, setQuery] = useState('');
  const [riskOnly, setRiskOnly] = useState(false);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [notice, setNotice] = useState('');

  const list = useMemo(() => vendors.filter((vendor) => {
    const matchesQuery = vendor.join(' ').toLowerCase().includes(query.toLowerCase());
    const matchesRisk = !riskOnly || vendor[4] === 'Review' || vendor[2] === 'Trial';
    return matchesQuery && matchesRisk;
  }), [query, riskOnly]);

  function exportCsv() {
    const rows = [['Vendor', 'Category', 'Tier', 'Score', 'Status', 'City'], ...list];
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ase-vendor-view.csv';
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${list.length} vendor records.`);
  }

  return <><Header /><main>
    <section className="page-hero vendor-hero"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> Business operations</p><h1>Vendor command centre.</h1><p>Source, assess, buy and monitor across your supplier network with real-time intelligence.</p><div className="hero-actions"><Link className="btn btn-dark" href="/app/canvas?template=vendor-registration">Design an intake flow</Link><Link className="btn btn-light" href="/app/voice">Ask by voice</Link></div></div></section>

    <div className="filter-bar"><div className="container filters" role="tablist" aria-label="Vendor operations module">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={`filter-btn ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)} key={item}>{item}</button>)}</div></div>

    <section className="section section-cream vendor-workspace"><div className="container">
      <div className="vendor-module-intro"><div><p className="eyebrow"><span className="eyebrow-dot" /> Active module</p><h2>{tab}</h2></div><p>{tabCopy[tab]}</p></div>
      <div className="kpi-grid vendor-kpis"><div className="kpi"><span>Active vendors</span><strong>284</strong><small>↑ 12 this month</small></div><div className="kpi"><span>On-time delivery</span><strong>94.2%</strong><small>↑ 2.8% quarter</small></div><div className="kpi"><span>Open PO value</span><strong>₦28.4m</strong><small>37 orders</small></div><div className="kpi"><span>At-risk vendors</span><strong>18</strong><small className="risk-copy">5 require action</small></div></div>

      <div className="vendor-board"><div className="vendor-toolbar"><label className="vendor-search"><Search size={14} /><span className="sr-only">Search vendor records</span><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendors, categories or cities…" /></label><button aria-pressed={riskOnly} className={`btn btn-ghost ${riskOnly ? 'active-filter' : ''}`} onClick={() => setRiskOnly((value) => !value)}><Filter size={14} /> {riskOnly ? 'Showing risks' : 'Risk filter'}</button><button className="btn btn-ghost" onClick={exportCsv} aria-label="Export current vendor view"><Download size={14} /> Export</button><Link className="btn btn-dark" href="/app/canvas?template=vendor-registration"><Plus size={14} /> Add vendor</Link></div>
        <p className="vendor-view-result" aria-live="polite">{notice || `${list.length} records in ${tab.toLowerCase()} view`}</p>
        <div className="vendor-table"><div className="vendor-row header"><span>Vendor</span><span>Category</span><span>Tier</span><span>Score</span><span>Status</span></div>{list.map((vendor) => <button className="vendor-row" key={vendor[0]} onClick={() => setSelected(vendor)}><span className="vendor-name"><i className="vendor-avatar">{vendor[0].split(' ').map((word) => word[0]).join('').slice(0, 2)}</i>{vendor[0]}<small>{vendor[5]}</small></span><span>{vendor[1]}</span><span className="tag tag-orange">{vendor[2]}</span><span className="vendor-score">{vendor[3]}</span><span className={`tag ${vendor[4] === 'Active' ? 'tag-green' : 'tag-orange'}`}>{vendor[4]}</span></button>)}{list.length === 0 && <p className="vendor-empty">No vendor records match this view.</p>}</div>
      </div>

      <Link href="/app/voice?prompt=Compare%20logistics%20vendor%20performance" className="voice-callout vendor-voice"><Mic2 size={20} /><p><strong>Ask Ase about your vendor network</strong>Try “Compare logistics vendor performance across Lagos and Accra this quarter.”</p><span>Open Voice Studio</span></Link>
    </div></section>
  </main><Footer />{selected && <VendorDetail vendor={selected} onClose={() => setSelected(null)} />}</>;
}

function VendorDetail({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.removeEventListener('keydown', closeOnEscape); document.body.style.overflow = ''; };
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="market-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-dialog-title"><div className="modal-cover"><button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close vendor detail"><X size={17} /></button><div className="modal-avatar">{vendor[0].split(' ').map((word) => word[0]).join('').slice(0, 2)}</div></div><div className="modal-body"><span className="tag tag-orange">{vendor[2]} VENDOR</span><h2 id="vendor-dialog-title">{vendor[0]}</h2><p className="muted vendor-detail-meta">{vendor[1]} · {vendor[5]} · Verified business</p><div className="stats-ribbon vendor-detail-stats"><div className="stat"><strong>{vendor[3]}</strong><span>Performance</span></div><div className="stat"><strong>₦15m</strong><span>Credit limit</span></div><div className="stat"><strong>Low</strong><span>Risk level</span></div></div><div className="modal-features"><div className="modal-feature"><CheckCircle2 size={14} /> Compliance current</div><div className="modal-feature"><ShieldCheck size={14} /> Risk reviewed</div><div className="modal-feature"><TrendingUp size={14} /> 2.8% performance gain</div><div className="modal-feature"><ShoppingCart size={14} /> 8 open orders</div></div><div className="modal-actions"><Link className="btn btn-dark" href={`/app/canvas?template=purchase-order&vendor=${encodeURIComponent(vendor[0])}`}><ShoppingCart size={14} /> Create PO</Link><Link className="btn btn-light" href="/resources">View documents</Link></div></div></div></div>;
}
