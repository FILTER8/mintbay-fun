'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { tokenHref, type NFT } from '@/lib/mintbay-gallery-shared';
import { loadPixelArt, drawContained } from './pixel-export';

const PAGE_SIZE = 16;
const SITE = 'https://mintbay.fun';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png');
  });
}

// Keying the inner component remounts it on wallet changes. No synchronous
// setState call is necessary inside the fetch effect.
export function ProfileGallery({ address }: { address: string }) {
  return <ProfileGalleryForAddress key={address.toLowerCase()} address={address} />;
}

function ProfileGalleryForAddress({ address }: { address: string }) {
  const [items, setItems] = useState<NFT[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/mintbay/profile/${encodeURIComponent(address)}`, { signal: controller.signal })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = typeof result === 'object' && result !== null && 'error' in result
            ? String(result.error) : 'Unable to load profile';
          throw new Error(message);
        }
        if (typeof result !== 'object' || result === null || !('tokens' in result) || !Array.isArray(result.tokens)) {
          throw new Error('Unexpected profile response');
        }
        return result.tokens as NFT[];
      })
      .then((tokens) => { if (!controller.signal.aborted) { setItems(tokens); setBusy(false); } })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setErr(error instanceof Error ? error.message : 'Unable to load profile');
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [address]);

  async function makeGalleryPng(): Promise<Blob> {
    const selected = items.slice(0, 16); // Always the latest 16, regardless of page.
    if (!selected.length) throw new Error('No artworks to export');
    const cell = 300, gap = 8, pad = 34, top = 28, footer = 92;
    const size = 4 * cell + 3 * gap + 2 * pad;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size + top + footer;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#f7f7f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 16; i++) {
      const x = pad + (i % 4) * (cell + gap);
      const y = top + pad + Math.floor(i / 4) * (cell + gap);
      ctx.fillStyle = '#f0f0ea';
      ctx.fillRect(x, y, cell, cell);
      const entry = selected[i];
      if (!entry?.image) continue;
      const image = await loadPixelArt(entry.image);
      drawContained(ctx, image, x, y, cell, cell, 1);
    }

    const footerY = top + pad + 4 * cell + 3 * gap + 20;
    try {
      const logo = await loadPixelArt('/mintbay-mark.png');
      drawContained(ctx, logo, pad, footerY, 48, 48, 1);
    } catch { /* The wordmark remains even if the logo cannot load. */ }
    ctx.fillStyle = '#151614';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('MINTBAY.FUN', pad + 63, footerY + 24);
    ctx.font = '16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('ON-CHAIN ART / LATEST 16', size - pad, footerY + 24);
    return blobFromCanvas(canvas);
  }

  async function shareGallery() {
    setExporting(true);
    setErr('');
    try {
      const png = await makeGalleryPng();
      const filename = `mintbay-${address.slice(0, 8)}-latest-16.png`;
      const profileUrl = `${SITE}/profile/${address.toLowerCase()}`;
      const text = 'My latest on-chain art on Mintbay ✳';
      const file = new File([png], filename, { type: 'image/png' });
      const shareData: ShareData = { files: [file], text, url: profileUrl };
      if (navigator.share && navigator.canShare?.(shareData)) {
        try { await navigator.share(shareData); return; }
        catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // Fall through to the download + X compose experience.
        }
      }
      // X intent cannot attach a locally generated PNG. Download it and let
      // the user add the image to the composer manually.
      saveBlob(png, filename);
      const intent = `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url: profileUrl })}`;
      window.open(intent, '_blank', 'noopener,noreferrer');
      setErr('PNG downloaded. Attach it to your X post to show the 4×4 gallery.');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gallery sharing failed');
    } finally { setExporting(false); }
  }

  async function exportLatest() {
    setExporting(true);
    setErr('');
    try {
      saveBlob(await makeGalleryPng(), `mintbay-${address.slice(0, 8)}-latest-16.png`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Export failed');
    } finally { setExporting(false); }
  }

  const pages = Math.ceil(items.length / PAGE_SIZE);
  return <>
    <div className="mb-profile-top">
      <span>{busy ? 'LOADING…' : `${items.length} ARTWORKS`}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-outline" disabled={busy || !items.length || exporting} onClick={exportLatest}>
          {exporting ? 'PREPARING…' : 'EXPORT LATEST 16 ↗'}
        </button>
        <button className="btn btn-outline" disabled={busy || !items.length || exporting} onClick={shareGallery}>
          SHARE 4×4 ON X ↗
        </button>
      </div>
    </div>
    {err && <p role="status">{err}</p>}
    <div className="mb-profile-grid">
      {items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((n) =>
        <Link key={`${n.contract}:${n.tokenId}`} href={tokenHref(n.contract, n.tokenId)}
          title={`${n.name} · #${n.tokenId}`} className="mb-square">
          {n.image ? <Image src={n.image} alt={n.name} width={512} height={512} unoptimized style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }} /> : <span>#{n.tokenId}</span>}
        </Link>
      )}
    </div>
    {!busy && !items.length && !err && <p>Nothing collected from indexed Mintbay collections yet.</p>}
    {pages > 1 && <div className="mb-pages">
      <button className="btn btn-outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← PREVIOUS</button>
      <span>{page + 1} / {pages}</span>
      <button className="btn btn-outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>NEXT →</button>
    </div>}
  </>;
}
