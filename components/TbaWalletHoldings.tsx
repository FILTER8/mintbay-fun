"use client";

import React, { useEffect, useState } from "react";

type Asset = { contract: string; tokenId: string; name: string | null; image: string | null };
type Holdings = { account: string; assets: Asset[]; nextPageKey: string | null; totalCount: number | null; indexedProvider: string };

/** Only fetches on explicit click; no wallet balances or NFT holdings are stored. */
export default function TbaWalletHoldings({ chainId, parentCollection, tokenId, apiBase = "https://api.mintbay.fun" }: {
  chainId: number; parentCollection: string; tokenId: string | number; apiBase?: string;
}) {
  const directoryKey = `${apiBase}:${chainId}:${parentCollection.toLowerCase()}`;
  const [directoryResult, setDirectoryResult] = useState<{key: string; supported: boolean} | null>(null);
  const supported = directoryResult?.key === directoryKey && directoryResult.supported;
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/v1/tba/collections`, {signal: controller.signal})
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Directory unavailable')))
      .then(data => {
        if (controller.signal.aborted) return;
        const entries = Array.isArray(data.collections) ? data.collections : [];
        setDirectoryResult({ key: directoryKey, supported: entries.some((entry: {chainId?: number; collection?: string}) =>
          entry.chainId === chainId && typeof entry.collection === 'string'
          && entry.collection.toLowerCase() === parentCollection.toLowerCase()) });
      }).catch(() => {if (!controller.signal.aborted) setDirectoryResult({ key: directoryKey, supported: false });});
    return () => controller.abort();
  }, [apiBase, chainId, parentCollection, directoryKey]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Holdings | null>(null);
  const [items, setItems] = useState<Asset[]>([]);
  async function load(pageKey?: string) {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const endpoint = `${apiBase}/v1/tba/holdings/${chainId}/${encodeURIComponent(parentCollection)}/${encodeURIComponent(String(tokenId))}`;
      const url = new URL(endpoint);
      if (pageKey) url.searchParams.set("pageKey", pageKey);
      const response = await fetch(url.toString(), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load wallet NFTs");
      const result = body as Holdings;
      setData(result);
      if (pageKey) {
        setItems(old => {
          const known = new Set(old.map(item => `${item.contract.toLowerCase()}:${item.tokenId}`));
          return [...old, ...result.assets.filter(item => !known.has(`${item.contract.toLowerCase()}:${item.tokenId}`))];
        });
      } else {
        setItems(result.assets);
      }
      setOpened(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Wallet lookup failed"); setOpened(true); }
    finally { setLoading(false); }
  }
  if (!supported) return null;
  return <section className="space-y-3 border-2 border-current p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold">Token-bound wallet</h3><p className="text-sm opacity-70">Live ERC-721 holdings, loaded on request</p></div>
      <button className="border-2 border-current px-4 py-2 font-bold" type="button" disabled={loading} onClick={() => load()}>{loading ? "Loading..." : opened ? "Refresh wallet" : "View wallet"}</button>
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {opened && data && <>
      <p className="break-all font-mono text-xs">{data.account}</p>
      <p className="text-sm opacity-70">{data.totalCount == null ? "ERC-721 NFTs" : `${data.totalCount} NFTs reported`} · Indexed ownership data may be delayed</p>
      {items.length === 0 && <p>No ERC-721 NFTs found by the ownership provider.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((item, i) => <div key={`${item.contract}:${item.tokenId}:${i}`} className="min-w-0 border border-current p-2">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt={item.name || `NFT #${item.tokenId}`} loading="lazy" className="aspect-square w-full object-contain"/>
          ) : <div className="aspect-square bg-neutral-100 dark:bg-neutral-800"/>}
          <p className="truncate text-sm font-bold">{item.name || `#${item.tokenId}`}</p>
          <p className="truncate font-mono text-xs opacity-60">{item.contract}</p>
        </div>)}
      </div>
      {data.nextPageKey && <button className="border border-current px-4 py-2" type="button" disabled={loading} onClick={() => load(data.nextPageKey!)}>{loading ? "Loading..." : "Load 20 more"}</button>}
    </>}
  </section>;
}
