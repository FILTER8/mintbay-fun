"use client";
import { useState } from 'react';
import { loadPixelArt, drawContained } from './pixel-export';

/** Export the NFT image itself, not the framed Mintbay page/card. */
export function DownloadToken({image,name,id}:{image:string;name:string;id:string}) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function download() {
    setBusy(true); setError('');
    try {
      const art = await loadPixelArt(image);
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      // Full-bleed square: don't add any padding, border, grey frame or branding.
      // Preserve transparency if present in the original on-chain image.
      drawContained(ctx, art, 0, 0, canvas.width, canvas.height, 1);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode PNG');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${name.replace(/[^a-z0-9-]+/gi,'-')}-${id}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PNG export unavailable');
    } finally { setBusy(false); }
  }
  return <div className="mb-token-download"><button type="button" className="btn btn-outline" onClick={download} disabled={busy}>{busy ? 'EXPORTING…' : 'DOWNLOAD PNG ↓'}</button>{error && <p role="alert">{error}</p>}</div>;
}
