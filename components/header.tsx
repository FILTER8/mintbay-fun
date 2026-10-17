import Link from 'next/link';
import { WalletConnect } from './wallet-connect';
export function Header(){return <header className="site-header"><div className="header-inner">
  <Link href="/" className="brand" aria-label="Mintbay home"><span className="brand-mark">M<span>✳</span></span><span>MINTBAY<span className="brand-domain">.FUN</span></span></Link>
  <nav aria-label="Main navigation" className="primary-nav"><Link href="/collections">COLLECTIONS</Link><Link href="/studio">STUDIO</Link><Link href="/profile">PROFILE</Link><Link href="/manual">THE MANUAL</Link></nav>
  <WalletConnect/>
</div></header>}
