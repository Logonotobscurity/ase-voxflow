import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function NotFound() {
  return <><Header /><main className="not-found"><div className="container"><span className="not-found-code">404 / ROUTE NOT FOUND</span><h1>This flow has no next step.</h1><p>The page may have moved, or the route may not exist. Return home or open a working canvas.</p><div className="hero-actions"><Link className="btn btn-dark" href="/">Return home</Link><Link className="btn btn-light" href="/app/canvas">Open canvas <ArrowRight size={15} /></Link></div></div></main><Footer /></>;
}
