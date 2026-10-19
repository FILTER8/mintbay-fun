'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { Wallet, ChevronDown, LogOut, Copy, Check, ArrowUpRight } from 'lucide-react';
import { supportedChains, chainNames } from '@/lib/chains';

export function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: changing, error: switchError } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasInjected, setHasInjected] = useState(false);
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

  // Detect a real EIP-1193 browser provider. Mobile Safari normally has none.
  useEffect(() => {
    let alive = true;
    const injectedConnectors = connectors.filter((connector) => connector.type === 'injected');
    Promise.all(injectedConnectors.map(async (connector) => {
      try { return Boolean(await connector.getProvider()); } catch { return false; }
    })).then((found) => { if (alive) setHasInjected(found.some(Boolean)); });
    return () => { alive = false; };
  }, [connectors]);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* Clipboard may be unavailable outside HTTPS. */ }
  }

  const visibleConnectors = connectors.filter((connector) => connector.type !== 'injected' || hasInjected);
  const walletConnectAvailable = connectors.some((connector) => connector.type === 'walletConnect');

  return (
    <div className="wallet-wrap">
      <button
        type="button"
        className={`wallet-button ${isConnected ? 'connected' : ''}`}
        onClick={() => { setOpen((value) => !value); reset(); }}
        aria-expanded={open}
        aria-label="Wallet menu"
      >
        <Wallet size={14} /><span>{isConnected ? short : 'CONNECT WALLET'}</span><ChevronDown size={12} />
      </button>
      {open && (
        <div className="wallet-popover" style={{ maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box' }}>
          {isConnected ? (
            <>
              <div className="popover-label">CONNECTED WALLET</div>
              <button type="button" className="popover-line" onClick={copy}>
                <span>{short}</span>{copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              {address && (
                <Link className="popover-line" href={`/profile/${address}`} onClick={() => setOpen(false)}>
                  <span>MY PROFILE</span><ArrowUpRight size={13} />
                </Link>
              )}
              <div className="popover-label spaced">SWITCH NETWORK</div>
              {supportedChains.map((chain) => (
                <button
                  type="button" className="popover-line" key={chain.id}
                  disabled={changing}
                  onClick={() => switchChain({ chainId: chain.id }, { onSuccess: () => setOpen(false) })}
                >
                  <span>{chainNames[chain.id]}</span>
                  {chainId === chain.id ? <span className="status-dot" /> : <ArrowUpRight size={13} />}
                </button>
              ))}
              {switchError && <div className="popover-error" role="alert">{switchError.message.slice(0, 180)}</div>}
              <button type="button" className="popover-line disconnect" onClick={() => { disconnect(); setOpen(false); }}>
                <span>DISCONNECT</span><LogOut size={13} />
              </button>
            </>
          ) : (
            <>
              <div className="popover-label">CONNECT A WALLET</div>
              {visibleConnectors.map((connector) => (
                <button
                  type="button" className="popover-line" key={connector.uid}
                  disabled={isPending}
                  onClick={() => connect({ connector }, { onSuccess: () => setOpen(false) })}
                >
                  <span>{connector.type === 'walletConnect' ? 'WalletConnect · Mobile' : connector.type === 'injected' ? 'Browser Wallet' : connector.name}</span>
                  <ArrowUpRight size={13} />
                </button>
              ))}
              <div className="popover-foot">
                {walletConnectAvailable
                  ? 'On mobile, choose WalletConnect to open your wallet app. Browser Wallet works inside wallet browsers and desktop extensions.'
                  : 'To enable connections from mobile Safari, configure NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. '}
              </div>
              {error && <div className="popover-error" role="alert">{error.message.slice(0, 180)}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
