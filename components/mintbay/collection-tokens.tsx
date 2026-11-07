'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { tokenHref, type NFT } from '@/lib/mintbay-gallery-shared';

const POLL_MS = 60000;
type TokenPage = { tokens: NFT[]; next: string | null };

// Server pages arrive newest-first, either from sequential on-chain IDs or
// from Alchemy's descending mint-transfer events for legacy contracts.
function mergeNewest(existing: NFT[], incoming: NFT[]): NFT[] {
 const existingByKey = new Map(existing.map(t => [`${t.contract.toLowerCase()}:${t.tokenId}`,t]));
 const merged = incoming.map(token => {
  existingByKey.delete(`${token.contract.toLowerCase()}:${token.tokenId}`);
  return token;
 });
 return [...merged,...existingByKey.values()];
}
function appendOlder(existing: NFT[], older: NFT[]): NFT[] {
 const byKey = new Map(existing.map(t => [`${t.contract.toLowerCase()}:${t.tokenId}`,t]));
 for (const token of older) {
  const key = `${token.contract.toLowerCase()}:${token.tokenId}`;
  if (!byKey.has(key)) byKey.set(key,token);
 }
 return Array.from(byKey.values());
}

export function CollectionTokens({ address, chainId, initial, next }: {
  address: string; chainId: number; initial: NFT[]; next: string | null;
}) {
  return <LiveTokens key={`${chainId}:${address.toLowerCase()}`} chainId={chainId} address={address} initial={initial} next={next} />;
}

function LiveTokens({ address, chainId, initial, next }: {
  address: string; chainId: number; initial: NFT[]; next: string | null;
}) {
  const [tokens, setTokens] = useState<NFT[]>(initial);
  const [cursor, setCursor] = useState<string | null>(next);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const inFlight = useRef(false);
  const morePagesLoaded = useRef(false);

  const urlFor = useCallback((start: string) =>
    `/api/mintbay/collection/${encodeURIComponent(address)}/tokens?${new URLSearchParams({chainId: String(chainId), start, fresh: '1'})}`,
  [address,chainId]);

  const refresh = useCallback(async (manual = false) => {
    // Automatic polling never interrupts people on a background tab.
    if ((!manual && document.visibilityState !== 'visible') || inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      const res = await fetch(urlFor('0'), { cache: 'no-store' });
      if (!res.ok) throw Error('Mint feed temporarily unavailable.');
      const data = await res.json() as TokenPage;
      if (!Array.isArray(data.tokens)) throw Error('Unexpected mint feed response.');
      if (manual) {
        // Return to the newest page, discarding now-stale pagination cursors.
        setTokens(data.tokens);
        setCursor(data.next);
        morePagesLoaded.current = false;
      } else {
        setTokens(prev => mergeNewest(prev, data.tokens));
        // Do not move the LOAD OLDER cursor while the user is browsing pages.
        if (!morePagesLoaded.current) setCursor(data.next);
      }
      setLastSynced(Date.now());
      setLive(true);
      setError('');
    } catch (e) {
      setLive(false);
      if (manual) setError(e instanceof Error ? e.message : 'Sync failed. Please try again.');
      // Keep the last good gallery visible if the indexer/RPC is unavailable.
    } finally {
      setSyncing(false);
      inFlight.current = false;
    }
  }, [urlFor]);

  useEffect(() => {
    const interval = window.setInterval(() => { void refresh(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    // The server already supplied the latest on-chain page; don't fetch twice on mount.
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  async function loadMore() {
    if (!cursor || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await fetch(urlFor(cursor), { cache: 'no-store' });
      if (!res.ok) throw Error('Unable to load older mints. Sync latest and try again.');
      const data = await res.json() as TokenPage;
      if (!Array.isArray(data.tokens)) throw Error('Unexpected token feed response.');
      morePagesLoaded.current = true;
      setTokens(prev => appendOlder(prev, data.tokens));
      setCursor(data.next);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load older NFTs.');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return <section className="mb-section">
    <div className="mb-section-title" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <span>LATEST MINTS.</span>
      <button className="btn btn-outline" type="button" disabled={syncing || busy}
        onClick={() => { void refresh(true); }}
        style={{minHeight:40,padding:'0 13px',gap:9,fontSize:11}}
        aria-label="Sync the latest minted NFTs">
        <RefreshCw size={15} aria-hidden="true" className={syncing ? 'mb-sync-spin' : ''}/>
        {syncing ? 'SYNCING…' : 'SYNC LATEST MINTS'}
      </button>
    </div>
    <p style={{fontSize:11,fontWeight:750,opacity:.72,margin:'0 0 10px'}} aria-live="polite">
      {syncing ? 'CHECKING THE CHAIN…' : live ? 'LATEST TOKENS FIRST · AUTO REFRESH EVERY 60S' : 'LATEST TOKENS FIRST · MANUAL SYNC AVAILABLE'}
      {lastSynced !== null && !syncing ? ` · LAST SYNC ${new Date(lastSynced).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}` : ''}
    </p>
    <div className="mb-gallery-grid">
      {tokens.map(t => <Link className="mb-art-card" key={`${t.contract}:${t.tokenId}`} href={tokenHref(address, t.tokenId,chainId)}>
        <div className="mb-square">
          {t.image ? <Image src={t.image} alt={t.name} width={512} height={512} unoptimized style={{width:'100%',height:'100%',objectFit:'fill',imageRendering:'pixelated'}} /> : <span>#{t.tokenId}</span>}
        </div>
        <div className="mb-card-text"><strong>#{t.tokenId}</strong></div>
      </Link>)}
    </div>
    {!tokens.length && <p>No mints found yet. After minting, press SYNC LATEST MINTS to check again.</p>}
    {cursor && <button className="btn btn-outline" type="button" disabled={busy || syncing} onClick={() => { void loadMore(); }}>
      {busy ? 'LOADING…' : 'LOAD OLDER MINTS ↓'}
    </button>}
    {error && <p role="alert">{error}</p>}
    <style jsx global>{`@keyframes mintbay-spin{to{transform:rotate(360deg)}}.mb-sync-spin{animation:mintbay-spin 1s linear infinite}`}</style>
  </section>;
}
