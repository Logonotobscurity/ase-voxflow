import { Header } from './Header';
import { Footer } from './Footer';

type Section = { title: string; body: string };

export function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: Section[] }) {
  return (
    <>
      <Header />
      <main>
        <section className="page-hero legal-hero"><div className="container"><p className="eyebrow"><span className="eyebrow-dot" /> {eyebrow}</p><h1>{title}</h1><p>{intro}</p><span className="legal-updated">Last updated · 14 August 2026</span></div></section>
        <section className="section section-paper"><div className="container legal-layout"><aside><strong>On this page</strong>{sections.map((section, index) => <a href={`#section-${index + 1}`} key={section.title}>{String(index + 1).padStart(2, '0')} {section.title}</a>)}</aside><article>{sections.map((section, index) => <section id={`section-${index + 1}`} key={section.title}><span>{String(index + 1).padStart(2, '0')}</span><h2>{section.title}</h2><p>{section.body}</p></section>)}</article></div></section>
      </main>
      <Footer />
    </>
  );
}
