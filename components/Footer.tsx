import Link from 'next/link';
import { Brand } from './Brand';

const groups = [
  { title: 'Product', links: [['Visual Canvas','/platform'],['Voice Studio','/app/voice'],['Vendor Ops','/app/vendors'],['Marketplace','/marketplace']] },
  { title: 'Solutions', links: [['Financial services','/solutions'],['Logistics','/solutions'],['Public sector','/solutions'],['All industries','/solutions']] },
  { title: 'Resources', links: [['Documentation','/resources'],['Community','/resources'],['Agent UI','/resources'],['System status','/resources']] },
  { title: 'Company', links: [['About Ase','/company'],['Careers','/company'],['Contact','/company'],['Privacy','/company']] },
];

export function Footer() {
  return <footer className="site-footer">
    <div className="container">
      <div className="footer-top">
        <div className="footer-brand"><Brand/><p>Enterprise automation that listens, understands and acts — designed for how African businesses actually run.</p></div>
        {groups.map(g => <div className="footer-group" key={g.title}><h3>{g.title}</h3>{g.links.map(([label,href]) => <Link href={href} key={label}>{label}</Link>)}</div>)}
      </div>
      <div className="footer-bottom"><span>© 2026 Ase Technologies. All rights reserved.</span><span>Lagos · Nairobi · Johannesburg · Global</span></div>
      <div className="footer-word" aria-hidden="true">ASE</div>
    </div>
  </footer>;
}
