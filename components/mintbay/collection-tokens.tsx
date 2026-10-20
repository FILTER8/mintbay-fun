"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { tokenHref, type NFT } from '@/lib/mintbay-gallery-shared';

const POLL_MS = 15000;

type TokenPage = { tokens: NFT[]; next: string | null };

function mergeTokens(existing: NFT[], incoming: NFT[]): NFT[] {
  const lookup = new Map(incoming.map(n => [`${n.contract.toLowerCase()}:${n.tokenId}`, n]));
  // Keep loaded pages intact; update cards we have fresh information for.
  const merged = existing.map(n => {
    const id = `${n.contract.toLowerCase()}:${n.tokenId}`;
    const newer = lookup.get(id);
    if (newer) lookup.delete(id);
    return newer || n;
  });
  // New token IDs belong at the end of the current ascending-token feed.
  return [...merged, ...lookup.values()].sort((a, b) => {
    const x = BigInt(a.tokenId);
    const y = BigInt(b.tokenId);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export function CollectionTokens({ address, initial, next }: {
  address: string; initial: NFT[]; next: string | null;
}) {
  return <LiveTokens key={address.toLowerCase()} address={address} initial={initial} next={next} />;
}

function LiveTokens({ address, initial, next }: {
  address: string; initial: NFT[]; next: string | null;
}) {
  const [tokens, setTokens] = useState<NFT[]>(initial);
  const [cursor, setCursor] = useState<string | null>(next);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const inFlight = useRef(false);
  const morePagesLoaded = useRef(false);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== 'visible' || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/mintbay/collection/${encodeURIComponent(address)}/tokens?start=0&fresh=1`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Live feed temporarily unavailable');
      const data = await res.json() as TokenPage;
      if (!Array.isArray(data.tokens)) throw new Error('Unexpected token feed response');
      setTokens(prev => mergeTokens(prev, data.tokens));
      // Preserve the user's pagination position when extra pages are loaded.
      if (!morePagesLoaded.current) setCursor(data.next);
      setLive(true);
      setError('');
    } catch {
      setLive(false);
      // Keep the last good artworks on screen during a temporary API outage.
    } finally {
      inFlight.current = false;
    }
  }, [address]);

  useEffect(() => {
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    // Verify the server-rendered data on the next task, outside effect setup.
    const initialRefreshId = window.setTimeout(() => { void refresh(); }, 0);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mintbay/collection/${encodeURIComponent(address)}/tokens?start=${encodeURIComponent(cursor)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to load more NFTs');
      const data = await res.json() as TokenPage;
      if (!Array.isArray(data.tokens)) throw new Error('Unexpected token feed response');
      morePagesLoaded.current = true;
      setTokens(prev => mergeTokens(prev, data.tokens));
      setCursor(data.next);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load more NFTs');
    } finally {
      setBusy(false);
    }
  }

  return <section className="mb-section">
    <div className="mb-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span>THE TOKENS.</span>
      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
        <span style={{ color: live ? '#639300' : '#888' }}>●</span> {live ? 'LIVE · 15S' : 'SYNCING'}
      </span>
    </div>
    <div className="mb-gallery-grid">
      {tokens.map(t => <Link className="mb-art-card" key={`${t.contract}:${t.tokenId}`} href={tokenHref(address, t.tokenId)}>
        <div className="mb-square">
          {t.image ? <Image src={t.image} alt={t.name} width={512} height={512} unoptimized style={{ width: '100%', height: '100%', objectFit: 'fill', imageRendering: 'pixelated' }} /> : <span>#{t.tokenId}</span>}
        </div>
        <div className="mb-card-text"><strong>#{t.tokenId}</strong></div>
      </Link>)}
    </div>
    {!tokens.length && <p>No tokens yet. The gallery checks for new mints automatically.</p>}
    {cursor && <button className="btn btn-outline" disabled={busy} onClick={loadMore}>
      {busy ? 'LOADING…' : 'LOAD MORE ↓'}
    </button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
