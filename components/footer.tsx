import Link from 'next/link';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span>© MINTBAY.FUN / MADE FOR THE INTERNET</span>
        <span>ALL ART IS CC0. NFA. JUST ART.</span>
        <div>
          <Link href="/manual">THE MANUAL ↗</Link>
          <Link href="/docs">DOCS ↗</Link>
          <a href="https://github.com/FILTER8/mintbay-agent" target="_blank" rel="noopener noreferrer">
            OPEN SOURCE ↗
          </a>
          <a href="https://x.com/mintbay_fun" target="_blank" rel="noopener noreferrer" aria-label="Mintbay on X">
            X ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
