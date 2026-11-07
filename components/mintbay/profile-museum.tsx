'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { tokenHref, type NFT } from '@/lib/mintbay-gallery-shared';
import {
  MintbayMuseumEngine,
  type MuseumLayout,
  type MuseumQuality,
  type MuseumSettings,
} from '@/lib/mintbay-museum-engine';
import styles from './profile-museum.module.css';

const LABELS: Record<MuseumLayout, string> = {
  corridor: '01 / CORRIDOR',
  atrium: '02 / ATRIUM',
  labyrinth: '03 / LABYRINTH',
};
const QUALITY_LABELS: Record<MuseumQuality, string> = {
  classic: '320 × 240 / ORIGINAL',
  pixel: '640 × 480 / PIXEL',
  balanced: '960 × 720 / BALANCED',
  full: '1280 × 960 / DETAILED',
};
const SITE = 'https://mintbay.fun';

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function galleryLink(address: string, options: MuseumSettings) {
  // The link works for non-wallet-connected visitors and preserves the room style.
  const origin = typeof window === 'undefined' ? SITE : window.location.origin;
  const url = new URL(`/profile/${address.toLowerCase()}/gallery`, origin);
  url.searchParams.set('layout', options.layout);
  url.searchParams.set('fg', options.foreground.slice(1));
  url.searchParams.set('bg', options.background.slice(1));
  url.searchParams.set('dither', String(options.dither));
  url.searchParams.set('quality', options.quality);
  return url.toString();
}

export function ProfileMuseum({ address, initialSettings }: { address: string; initialSettings: MuseumSettings }) {
  return <MuseumSession key={address.toLowerCase()} address={address.toLowerCase()} initialSettings={initialSettings} />;
}

function MuseumSession({ address, initialSettings }: { address: string; initialSettings: MuseumSettings }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MintbayMuseumEngine | null>(null);
  const inspectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<NFT[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState<MuseumSettings>(initialSettings);
  const [menu, setMenu] = useState(false);
  const [focused, setFocused] = useState<number | null>(null);
  const [inspectIndex, setInspectIndex] = useState<number | null>(null);
  const [textureCount, setTextureCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const fetchTokens = useCallback(async (signal?: AbortSignal) => {
    const result = await fetch(`/api/mintbay/profile/${encodeURIComponent(address)}?fresh=1`, {
      signal, cache: 'no-store',
    });
    const json: unknown = await result.json();
    if (!result.ok) {
      const error = json && typeof json === 'object' && 'error' in json ? String(json.error) : 'Museum data unavailable';
      throw new Error(error);
    }
    if (!json || typeof json !== 'object' || !('tokens' in json) || !Array.isArray(json.tokens)) {
      throw new Error('The profile API returned invalid NFT data');
    }
    // The museum displays exactly what the existing profile API says this wallet owns.
    return json.tokens as NFT[];
  }, [address]);

  useEffect(() => {
    const abort = new AbortController();
    void fetchTokens(abort.signal).then(tokens => {
      if (abort.signal.aborted) return;
      setItems(tokens);
      setLoaded(true);
      setLoading(false);
    }).catch(error => {
      if (abort.signal.aborted) return;
      setLoadError(error instanceof Error ? error.message : 'Unable to load museum');
      setLoading(false);
    });
    return () => abort.abort();
  }, [fetchTokens]);

  // The canvas renderer is intentionally isolated from the NFT/network layer.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!loaded || !canvas) return;
    let instance: MintbayMuseumEngine;
    try {
      instance = new MintbayMuseumEngine(canvas, address, items, settingsRef.current, {
        onFocus: setFocused,
        onArtProgress: (amount) => setTextureCount(amount),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Museum renderer unavailable';
      // The state update belongs to an asynchronous callback, not the effect body.
      queueMicrotask(() => setLoadError(message));
      return;
    }
    engineRef.current = instance;
    instance.start();
    return () => {
      if (inspectTimer.current) clearTimeout(inspectTimer.current);
      instance.destroy();
      if (engineRef.current === instance) engineRef.current = null;
    };
  }, [address, items, loaded]);

  useEffect(() => {
    engineRef.current?.setSettings(settings);
    // Keep a deep link shareable after changing room, colours or dithering.
    if (typeof window === 'undefined') return;
    const url = galleryLink(address, settings);
    if (window.location.href !== url) window.history.replaceState(window.history.state, '', url);
  }, [settings, address]);

  useEffect(() => {
    engineRef.current?.setPaused(menu || inspectIndex !== null || loading);
  }, [menu, inspectIndex, loading, loaded]);

  useEffect(() => {
    const handle = () => setFullscreen(document.fullscreenElement === hostRef.current);
    document.addEventListener('fullscreenchange', handle);
    return () => document.removeEventListener('fullscreenchange', handle);
  }, []);

  const openInspect = useCallback(() => {
    if (menu || inspectIndex !== null || inspectTimer.current) return;
    const engine = engineRef.current;
    const index = engine?.getFocusIndex();
    if (!engine || index === undefined || index === null || !engine.getArt(index)) return;
    engine.reach();
    inspectTimer.current = setTimeout(() => {
      inspectTimer.current = null;
      setInspectIndex(index);
    }, 310);
  }, [menu, inspectIndex]);

  const closeInspect = useCallback(() => {
    if (inspectTimer.current) { clearTimeout(inspectTimer.current); inspectTimer.current = null; }
    setInspectIndex(null);
  }, []);

  const toggleMenu = useCallback(() => {
    closeInspect();
    setMenu(v => !v);
  }, [closeInspect]);

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement ||
        (target instanceof HTMLElement && target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'spacebar') { e.preventDefault(); toggleMenu(); return; }
      if (key === 'escape') {
        if (inspectIndex !== null) closeInspect();
        else if (menu) setMenu(false);
        return;
      }
      if (key === 'e' && !menu && inspectIndex === null) { e.preventDefault(); openInspect(); return; }
      if (menu || inspectIndex !== null) return;
      if (['w', 'a', 's', 'd', 'q', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        engineRef.current?.setKey(key, true);
        e.preventDefault();
      }
    };
    const keyUp = (e: KeyboardEvent) => engineRef.current?.setKey(e.key.toLowerCase(), false);
    const blur = () => engineRef.current?.clearKeys();
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, [toggleMenu, openInspect, closeInspect, menu, inspectIndex]);

  async function toggleFullscreen() {
    const node = hostRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      setNotice('Fullscreen is unavailable in this browser. The gallery still fills the window.');
    }
  }

  async function copyGalleryLink() {
    const link = galleryLink(address, settingsRef.current);
    try {
      await navigator.clipboard.writeText(link);
      setNotice('GALLERY LINK COPIED. ANYONE CAN VISIT.');
    } catch {
      // Secure clipboard access may not be available on local/non-HTTPS deployments.
      window.prompt('Copy your public gallery link:', link);
      setNotice('PUBLIC GALLERY LINK READY.');
    }
  }

  function shareOnX() {
    const url = galleryLink(address, settingsRef.current);
    const text = `Explore my on-chain art museum on Mintbay. ${items.length} artworks, one gallery.`;
    window.open(`https://twitter.com/intent/tweet?${new URLSearchParams({ text, url }).toString()}`, '_blank', 'noopener,noreferrer');
  }

  async function syncArt() {
    setNotice('CHECKING COLLECTOR ASSETS…');
    try {
      const tokens = await fetchTokens();
      setItems(tokens);
      setTextureCount(0);
      setNotice(`${tokens.length} ARTWORKS SYNCED.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sync unavailable. Existing art is still visible.');
    }
  }

  function changeSettings(update: Partial<MuseumSettings>) {
    if (inspectIndex !== null) closeInspect();
    setSettings(previous => ({ ...previous, ...update }));
  }

  const inspected = inspectIndex === null ? null : items[inspectIndex] ?? null;
  const focusedArt = focused === null ? null : items[focused] ?? null;
  const paletteStyle = {
    '--museum-fg': settings.foreground,
    '--museum-bg': settings.background,
  } as CSSProperties;
  const pointer = useRef<{ id: number; x: number; y: number; startX: number; startY: number; dragged: boolean } | null>(null);

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (menu || inspectIndex !== null) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, dragged: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointer.current || pointer.current.id !== event.pointerId) return;
    const dx = event.clientX - pointer.current.x;
    if (Math.hypot(event.clientX - pointer.current.startX, event.clientY - pointer.current.startY) > 8) pointer.current.dragged = true;
    if (pointer.current.dragged) engineRef.current?.turn(dx);
    pointer.current.x = event.clientX; pointer.current.y = event.clientY;
  }
  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointer.current || pointer.current.id !== event.pointerId) return;
    const click = !pointer.current.dragged;
    pointer.current = null;
    if (click) openInspect();
  }

  // These are genuine event handlers, rather than a function called during render.
  // React's refs rule allows engineRef access here because a pointer event is running.
  function touchPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const key = event.currentTarget.dataset.moveKey;
    if (!key) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    engineRef.current?.setKey(key, true);
  }

  function touchPointerEnd(event: React.PointerEvent<HTMLButtonElement>) {
    const key = event.currentTarget.dataset.moveKey;
    if (key) engineRef.current?.setKey(key, false);
  }

  return <div ref={hostRef} className={styles.root} style={paletteStyle}>
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label="Interactive on-chain art museum. Move with WASD and turn with the mouse." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { pointer.current = null; }}/>
      <span aria-hidden="true" className={styles.crosshair}>+</span>
    </div>

    <header className={styles.topbar}>
      <Link className={styles.brand} href={`/profile/${address}`} title="Return to 2D collector gallery">← MINTBAY / MUSEUM</Link>
      <div className={styles.topmeta}>{shortAddress(address)} <span className={styles.dot}>·</span> {items.length} WORKS</div>
      <div className={styles.topActions}>
        <button type="button" onClick={copyGalleryLink} className={styles.topButton}>SHARE ↗</button>
        <button type="button" onClick={toggleFullscreen} className={styles.topButton}>{fullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN ⛶'}</button>
        <button type="button" onClick={toggleMenu} className={styles.menuButton}>MENU [ SPACE ]</button>
      </div>
    </header>

    {!menu && !inspected && !loading && loaded && items.length > 0 && <>
      <div className={styles.bottomLeft}>
        <span className={styles.kicker}>[ {LABELS[settings.layout]} ]</span>
        <span className={styles.help}>WASD MOVE · DRAG LOOK · E / CLICK INSPECT · SPACE MENU</span>
      </div>
      <div className={styles.bottomRight}>{textureCount} TEXTURES LOADED <span className={styles.dot}>·</span> {items.length} ASSETS</div>
      {focusedArt && <button className={styles.inspectHint} type="button" onClick={openInspect}>
        <span>✳</span> E / INSPECT <strong>{focusedArt.name || `#${focusedArt.tokenId}`}</strong>
      </button>}
      <div className={styles.mobilePad} aria-label="Touch movement controls">
        <div className={styles.dpad}>
          <button type="button" className={styles.padUp} aria-label="Move forward" data-move-key="w" onPointerDown={touchPointerDown} onPointerUp={touchPointerEnd} onPointerCancel={touchPointerEnd} onLostPointerCapture={touchPointerEnd}>↑</button>
          <button type="button" aria-label="Strafe left" data-move-key="a" onPointerDown={touchPointerDown} onPointerUp={touchPointerEnd} onPointerCancel={touchPointerEnd} onLostPointerCapture={touchPointerEnd}>←</button>
          <button type="button" aria-label="Move backward" data-move-key="s" onPointerDown={touchPointerDown} onPointerUp={touchPointerEnd} onPointerCancel={touchPointerEnd} onLostPointerCapture={touchPointerEnd}>↓</button>
          <button type="button" aria-label="Strafe right" data-move-key="d" onPointerDown={touchPointerDown} onPointerUp={touchPointerEnd} onPointerCancel={touchPointerEnd} onLostPointerCapture={touchPointerEnd}>→</button>
        </div>
        <button className={styles.mobileInspect} type="button" onClick={openInspect} disabled={!focusedArt}>INSPECT ✳</button>
      </div>
    </>}

    {loading && <div className={styles.stateScreen} role="status">
      <div className={styles.stateBox}><span className={styles.kicker}>[ MINTBAY / ASSET DISCOVERY ]</span>
        <h1>YOUR MUSEUM.</h1><p>READING YOUR COLLECTED ON-CHAIN ARTWORKS…</p>
        <div className={styles.scanline}/></div>
    </div>}
    {!loading && loadError && !loaded && <div className={styles.stateScreen} role="alert"><div className={styles.stateBox}>
      <h1>COULD NOT OPEN THE MUSEUM.</h1><p>{loadError}</p>
      <button className={styles.solidButton} type="button" onClick={() => window.location.reload()}>RETRY ↻</button>
      <Link className={styles.textLink} href={`/profile/${address}`}>← BACK TO PROFILE</Link>
    </div></div>}
    {!loading && loaded && items.length === 0 && <div className={styles.stateScreen}><div className={styles.stateBox}>
      <span className={styles.kicker}>[ THE ROOM IS READY ]</span><h1>NO ARTWORKS YET.</h1>
      <p>THIS WALLET HAS NO NFTS FROM INDEXED MINTBAY COLLECTIONS.</p>
      <Link className={styles.solidButton} href={`/profile/${address}`}>← BACK TO PROFILE</Link>
    </div></div>}

    {menu && !loading && <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Museum menu">
      <div className={styles.menuPanel}>
        <div className={styles.menuHead}><div><span className={styles.kicker}>[ MINTBAY / PERSONAL MUSEUM ]</span><h2>GALLERY MENU.</h2></div>
          <button className={styles.iconClose} type="button" onClick={() => setMenu(false)} aria-label="Close menu">×</button></div>
        <div className={styles.section}>
          <div className={styles.controlTitle}>01 / EXHIBITION LAYOUT</div>
          <div className={styles.layoutGrid}>
            {(['corridor', 'atrium', 'labyrinth'] as const).map(layout =>
              <button type="button" key={layout} onClick={() => changeSettings({ layout })}
                className={`${styles.layoutButton} ${settings.layout === layout ? styles.selected : ''}`} aria-pressed={settings.layout === layout}>
                {LABELS[layout]}
              </button>)}
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.controlTitle}>02 / TWO-COLOUR PALETTE</div>
          <div className={styles.colorGrid}>
            <label className={styles.colorInput}><span>INK / WALLS</span>
              <input aria-label="Ink colour" type="color" value={settings.foreground} onChange={(event: ChangeEvent<HTMLInputElement>) => changeSettings({ foreground: event.target.value })}/>
              <code>{settings.foreground.toUpperCase()}</code>
            </label>
            <label className={styles.colorInput}><span>VOID / BACKGROUND</span>
              <input aria-label="Background colour" type="color" value={settings.background} onChange={(event: ChangeEvent<HTMLInputElement>) => changeSettings({ background: event.target.value })}/>
              <code>{settings.background.toUpperCase()}</code>
            </label>
          </div>
          <div className={styles.presetRow}>
            <button type="button" onClick={() => changeSettings({ foreground: '#ffffff', background: '#000000' })}>BLACK / WHITE</button>
            <button type="button" onClick={() => changeSettings({ foreground: '#ccff00', background: '#000000' })}>HOOD LIME</button>
            <button type="button" onClick={() => changeSettings({ foreground: '#ffc676', background: '#130d09' })}>AMBER</button>
            <button type="button" onClick={() => changeSettings({ foreground: settings.background, background: settings.foreground })}>SWAP ↔</button>
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.controlTitle}>03 / WALL DITHERING <span>{settings.dither}%</span></div>
          <input className={styles.range} aria-label="Wall dithering amount" type="range" min="0" max="100" step="1" value={settings.dither}
            onChange={(event: ChangeEvent<HTMLInputElement>) => changeSettings({ dither: Number(event.target.value) })}/>
          <p className={styles.description}>ORIGINAL 4×4 BAYER PATTERN · 0% SOLID · 50% DEFAULT · 100% INVISIBLE WALLS.</p>
        </div>
        <div className={styles.section}>
          <div className={styles.controlTitle}>04 / RENDER DETAIL</div>
          <select className={styles.quality} aria-label="Render detail" value={settings.quality} onChange={(event: ChangeEvent<HTMLSelectElement>) => changeSettings({ quality: event.target.value as MuseumQuality })}>
            {(['classic', 'pixel', 'balanced', 'full'] as const).map(value => <option value={value} key={value}>{QUALITY_LABELS[value]}</option>)}
          </select>
          <p className={styles.description}>OUTPUT CANVAS: 1280 × 960. ORIGINAL 320 × 240 MATCHES THE HTML MUSEUM; HIGHER MODES USE FINER BAYER PIXELS.</p>
        </div>
        <div className={styles.menuActions}>
          <button className={styles.solidButton} type="button" onClick={() => setMenu(false)}>ENTER GALLERY ↗</button>
          <button className={styles.outlineButton} type="button" onClick={toggleFullscreen}>{fullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN ⛶'}</button>
          <button className={styles.outlineButton} type="button" onClick={copyGalleryLink}>COPY SHARE LINK ↗</button>
          <button className={styles.outlineButton} type="button" onClick={shareOnX}>SHARE ON X ↗</button>
        </div>
        <div className={styles.menuFooter}>
          <button type="button" onClick={() => void syncArt()} className={styles.textLink}>SYNC COLLECTOR ASSETS ↻</button>
          <Link className={styles.textLink} href={`/profile/${address}`}>← RETURN TO PROFILE</Link>
        </div>
        <p className={styles.description}>WASD MOVE · DRAG LOOK · E OR CLICK INSPECT · SPACE OPEN / CLOSE</p>
      </div>
    </div>}

    {inspected && <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Inspect ${inspected.name || inspected.tokenId}`}>
      <div className={styles.inspectPanel}>
        <div className={styles.inspectTitle}><span className={styles.kicker}>[ WORK {String((inspectIndex ?? 0) + 1).padStart(3, '0')} / {items.length} ]</span>
          <button className={styles.iconClose} type="button" onClick={closeInspect} aria-label="Close artwork inspection">×</button></div>
        <div className={styles.inspectGrid}>
          <div className={styles.artwork}>
            {inspected.image
              ? <Image src={inspected.image} alt={inspected.name || `Token #${inspected.tokenId}`} fill unoptimized sizes="(max-width: 700px) 95vw, 60vw" style={{ objectFit: 'contain', imageRendering: 'pixelated' }}/>
              : <span>ARTWORK IMAGE UNAVAILABLE</span>}
          </div>
          <div className={styles.artDetail}>
            <p className={styles.kicker}>ON-CHAIN ART / OWNED ASSET</p>
            <h2>{inspected.name || `TOKEN #${inspected.tokenId}`}</h2>
            <div className={styles.dataRow}><span>TOKEN</span><strong>#{inspected.tokenId}</strong></div>
            <div className={styles.dataRow}><span>CHAIN</span><strong>{inspected.chainId ?? 4663}</strong></div>
            <div className={styles.dataRow}><span>CONTRACT</span><code>{shortAddress(inspected.contract)}</code></div>
            <div className={styles.traits}>
              {inspected.attributes.slice(0, 12).map((attribute, i) => <div className={styles.trait} key={`${attribute.trait_type}-${i}`}>
                <span>{attribute.trait_type}</span><strong>{attribute.value}</strong>
              </div>)}
              {!inspected.attributes.length && <span className={styles.description}>NO TRAITS PROVIDED</span>}
            </div>
            <Link className={styles.solidButton} href={tokenHref(inspected.contract, inspected.tokenId, inspected.chainId ?? 4663)} target="_blank" rel="noopener noreferrer">OPEN TOKEN PAGE ↗</Link>
            <button type="button" onClick={closeInspect} className={styles.outlineButton}>← RETURN TO MUSEUM</button>
          </div>
        </div>
      </div>
    </div>}
    {notice && <div className={styles.notice} role="status" onClick={() => setNotice('')}>{notice} <span>×</span></div>}
  </div>;
}
