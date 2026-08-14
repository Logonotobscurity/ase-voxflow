import Link from 'next/link';

export function Brand({ dark = false, href = '/' }: { dark?: boolean; href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Ase home" style={dark ? { color: '#22221f' } : undefined}>
      <span className="brand-mark" aria-hidden="true" />
      <span><span className="brand-name">Ase</span><span className="brand-platform">VOXFLOW platform</span></span>
    </Link>
  );
}
