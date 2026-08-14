import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from './Brand';

const groups = [
  { title: 'Platform', links: [['Overview', '/platform'], ['Visual Canvas', '/app/canvas'], ['Voice Studio', '/app/voice'], ['Vendor Operations', '/app/vendors']] },
  { title: 'Discover', links: [['Solutions', '/solutions'], ['Marketplace', '/marketplace'], ['Resources', '/resources'], ['Company', '/company']] },
  { title: 'Trust', links: [['Security', '/security'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['System status', '/resources']] },
  { title: 'Start', links: [['Build a workflow', '/app/canvas'], ['Explore agents', '/marketplace'], ['Talk to us', 'mailto:hello@ase.africa'], ['Creator programme', '/company']] },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Brand />
            <p>Operational intelligence that listens, understands and acts—designed for how African businesses actually run.</p>
            <a className="footer-contact" href="mailto:hello@ase.africa">hello@ase.africa <ArrowUpRight size={14} /></a>
          </div>
          {groups.map((group) => (
            <div className="footer-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.links.map(([label, href]) => href.startsWith('mailto:') ? <a href={href} key={label}>{label}</a> : <Link href={href} key={label}>{label}</Link>)}
            </div>
          ))}
        </div>
        <div className="footer-bottom"><span>© 2026 Ase Technologies. All rights reserved.</span><span>Port Harcourt · Lagos · Nairobi · Johannesburg</span></div>
        <div className="footer-word" aria-hidden="true">ASE / VOXFLOW</div>
      </div>
    </footer>
  );
}
