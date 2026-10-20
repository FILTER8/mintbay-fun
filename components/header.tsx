import Image from 'next/image';
import Link from 'next/link';
import { WalletConnect } from './wallet-connect';

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Mintbay home">
          <Image
            src="/brand/mintbay-mark.png"
            alt=""
            width={34}
            height={34}
            style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }}
            priority
          />
          <span>
            MINTBAY<span className="brand-domain">.FUN</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="primary-nav">
          <Link href="/collections">COLLECTIONS</Link>
          <Link href="/studio">STUDIO</Link>
          <Link href="/profile">PROFILE</Link>
          <Link href="/manual">THE MANUAL</Link>
          <a
            href="https://x.com/mintbay_fun"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Mintbay on X (opens in a new tab)"
          >
            X ↗
          </a>
        </nav>

        <WalletConnect />
      </div>
    </header>
  );
}
