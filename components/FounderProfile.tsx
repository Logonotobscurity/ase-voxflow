import { ArrowUpRight, MapPin } from 'lucide-react';

type Connection = {
  name: string;
  copy: string;
  /** Only verified destinations are linked; `null` renders an explicit pending state instead of a guessed URL. */
  href: string | null;
  label: string;
};

// LinkedIn was supplied by the founder; GitHub is the account that owns this project's source repository.
const connections: Connection[] = [
  { name: 'LinkedIn', copy: 'Connect with me on LinkedIn.', href: 'https://ng.linkedin.com/in/logo-oluwamayowa-cpo-', label: 'Oluwamayowa Adebola Logo on LinkedIn' },
  { name: 'GitHub', copy: 'Explore my projects on GitHub.', href: 'https://github.com/Logonotobscurity', label: 'Oluwamayowa Adebola Logo on GitHub' },
  { name: 'LOG_ON Portfolio', copy: 'Explore LOG_ON AI Solutions.', href: null, label: 'LOG_ON AI Solution Agency portfolio' },
];

const focusAreas = ['Agentic AI', 'Multi-agent systems', 'Intelligent automation', 'AI assurance', 'Cybersecurity', 'LLMs', 'System integration', 'Responsible AI'];

export function FounderProfile() {
  return (
    <section className="section section-cream founder-section" aria-labelledby="founder-heading">
      <div className="container founder-layout">
        <aside className="founder-card" aria-label="Founder summary">
          <span className="founder-monogram" aria-hidden="true">OL</span>
          <p className="eyebrow">Founder</p>
          <p className="founder-name">Oluwamayowa Adebola Logo</p>
          <p className="founder-role">Applied AI and AI Systems Engineer</p>
          <p className="founder-meta"><MapPin size={15} aria-hidden="true" /> Lagos, Nigeria</p>
          <p className="founder-meta">Founder, LOG_ON AI Solution Agency</p>
          <ul className="founder-tags" aria-label="Focus areas">
            {focusAreas.map((area) => <li key={area}>{area}</li>)}
          </ul>
        </aside>

        <div className="founder-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> The founder</p>
          <h2 className="h2" id="founder-heading">About Me</h2>
          <p className="lede">My name is Oluwamayowa Adebola Logo, an Applied AI and AI Systems Engineer based in Lagos, Nigeria. I build practical AI-powered solutions at the intersection of agentic AI, intelligent automation, AI assurance, cybersecurity, and business systems.</p>
          <p>As the founder of LOG_ON AI Solution Agency, I focus on turning ideas and emerging technologies into useful, production-oriented systems that solve real-world problems. My work explores AI agents, multi-agent systems, workflow automation, large language models (LLMs), system integration, and responsible AI development.</p>
          <p>I am particularly interested in building AI solutions that support business growth, improve operational efficiency, expand access to technology across Africa, and make intelligent systems more reliable, secure, and useful.</p>
          <p>I enjoy researching emerging technologies, developing open-source projects, experimenting with new architectures, and collaborating with people who are passionate about using technology to create meaningful impact.</p>
          <blockquote className="founder-goal">My goal is to help shape the future of AI by building systems that are not only intelligent but also practical, trustworthy, and accessible.</blockquote>
          <p>I&apos;m always open to connecting with developers, researchers, founders, AI enthusiasts, and organizations working on innovative technology solutions.</p>

          <div className="founder-connect">
            <h3 id="founder-connect-heading">Connect With Me</h3>
            <ul className="connect-grid">
              {connections.map((item) => (
                <li key={item.name}>
                  {item.href ? (
                    <a className="connect-card" href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`${item.label} (opens in a new tab)`}>
                      <strong>{item.name}</strong><span>{item.copy}</span><ArrowUpRight size={17} aria-hidden="true" />
                    </a>
                  ) : (
                    <div className="connect-card is-pending">
                      <strong>{item.name}</strong><span>{item.copy}</span><em>Link coming soon</em>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
