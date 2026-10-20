import Image from 'next/image';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { WalletConnect } from './wallet-connect';

const bankrApp = 'https://bankr.bot/u/0xb316e8ea7bc9b24ea5fd4ebd07051678c27ffe79/apps/mintbay-monitor';

function NavigationLinks() {
  return <>
    <Link href="/collections">COLLECTIONS</Link>
    <Link href="/studio">STUDIO</Link>
    <Link href="/profile">PROFILE</Link>
    <Link href="/manual">THE MANUAL</Link>
    <a href={bankrApp} target="_blank" rel="noopener noreferrer" aria-label="Mintbay Bankr app (opens in a new tab)" className="header-bankr-link">
      <Image src="/brand/bankr-symbol.svg" alt="" width={20} height={18} style={{width:20,height:18,objectFit:'contain'}} />
      BANKR APP ↗
    </a>
    <a href="https://x.com/mintbay_fun" target="_blank" rel="noopener noreferrer" aria-label="Mintbay on X (opens in a new tab)">X ↗</a>
  </>;
}

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Mintbay home">
          <Image src="/brand/mintbay-mark.png" alt="" width={34} height={34} style={{width:34,height:34,objectFit:'contain',flexShrink:0}} priority />
          <span>MINTBAY<span className="brand-domain">.FUN</span></span>
        </Link>
        <nav aria-label="Main navigation" className="primary-nav"><NavigationLinks /></nav>
        <details className="header-mobile-menu">
          <summary aria-label="Toggle navigation menu"><Menu size={23} aria-hidden="true" /><span>MENU</span></summary>
          <nav className="header-mobile-panel" aria-label="Mobile navigation"><NavigationLinks /></nav>
        </details>
        <WalletConnect />
      </div>
    </header>
  );
}
