/**
 * Mintbay Museum / lightweight, two-colour raycaster.
 *
 * Architecture and walls use the original 4x4 Bayer pattern from the HTML
 * museum, at the chosen 320/640/960/1280 render resolution. NFT artwork is composited from
 * its native image inside a square contain-fit canvas, not reduced to 20x20.
 * The profile supplies assets; only missing/poor cached artwork is resolved
 * through Mintbay's existing, read-only on-chain mint-preview endpoint.
 */

import type { NFT } from './mintbay-gallery-shared';

export type MuseumLayout = 'atrium' | 'corridor' | 'labyrinth';
export type MuseumQuality = 'classic' | 'pixel' | 'balanced' | 'full';
export type MuseumSettings = {
  layout: MuseumLayout;
  foreground: string;
  background: string;
  dither: number;
  quality: MuseumQuality;
};

export type MuseumCallbacks = {
  onFocus: (index: number | null) => void;
  onArtProgress: (loaded: number, total: number) => void;
};

type WallSlot = { x: number; y: number; face: number; art: number };
type RayHit = { x: number; y: number; face: number; u: number; distance: number; side: number };
type TextureEntry = {
  image: HTMLImageElement | null;
  tile: HTMLCanvasElement | null;
  backing: 'fg' | 'bg';
  status: 'queued' | 'loading' | 'ready' | 'failed';
  touched: number;
};

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const QUALITY_WIDTH: Record<MuseumQuality, number> = { classic: 320, pixel: 640, balanced: 960, full: 1280 };
const MAX_CACHE = 48;
const MAX_LOADING = 4;
const FOV = 0.68;
// Museum-scale frame: roughly half of one wall tile, with a generous mat.
// Artwork is contained inside it at native aspect ratio, never cropped or stretched.
const FRAME_SIZE = 0.54;
const ART_FILL = 0.76;
const ART_TEXTURE_SIZE = 512;
const IMAGE_TIMEOUT = 8000;
const CANONICAL_TIMEOUT = 8000;
// Original HTML at 22%: shade * (.06 + .22 * .88), Bayer threshold / 16.
const ORIGINAL_GAIN = 0.06 + 0.22 * 0.88;
const ORIGINAL_SLIDER = 0.22;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function colour(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = (n >>> 16) & 255, g = (n >>> 8) & 255, b = n & 255;
  // Uint32Array over an ImageData buffer is little-endian in supported browsers.
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function hash(input: string): number {
  let n = 2166136261;
  for (let i = 0; i < input.length; i++) n = Math.imul(n ^ input.charCodeAt(i), 16777619);
  return n >>> 0;
}
function rand(seed: number): () => number {
  let n = seed;
  return () => {
    n += 0x6D2B79F5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Procedural rooms; every layout grows with the number of owned artworks. */
export class MintbayMuseumEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bufferCtx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private pixels: Uint32Array;
  private viewWidth = 640;
  private viewHeight = 480;
  private fg = colour('#ffffff');
  private bg = colour('#000000');
  private map = new Uint8Array(0);
  private mw = 0;
  private mh = 0;
  private player = { x: 0, y: 0, angle: 0 };
  private facing = new Map<string, number>();
  private artifacts: NFT[];
  private owner: string;
  private settings: MuseumSettings;
  private callbacks: MuseumCallbacks;
  private textures = new Map<number, TextureEntry>();
  private queue: number[] = [];
  private pending = 0;
  private requested = new Set<number>();
  private destroyed = false;
  private keys = new Set<string>();
  private paused = false;
  private raf = 0;
  private lastFrame = 0;
  private lastDraw = 0;
  private focus: number | null = null;
  private handSource: HTMLImageElement | null = null;
  private handTint: HTMLCanvasElement | null = null;
  private handStart = 0;
  private handUntil = 0;
  private handSide: 'left' | 'right' = 'left';

  constructor(canvas: HTMLCanvasElement, owner: string, artifacts: NFT[], options: MuseumSettings, callbacks: MuseumCallbacks) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Museum canvas is not available');
    this.canvas = canvas;
    this.ctx = ctx;
    this.owner = owner;
    this.artifacts = artifacts;
    this.settings = options;
    this.callbacks = callbacks;
    this.buffer = document.createElement('canvas');
    const bufferCtx = this.buffer.getContext('2d', { alpha: false });
    if (!bufferCtx) throw new Error('Museum render buffer is not available');
    this.bufferCtx = bufferCtx;
    this.imageData = bufferCtx.createImageData(this.viewWidth, this.viewHeight);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
    this.canvas.width = 1280;
    this.canvas.height = 960;
    this.ctx.imageSmoothingEnabled = false;
    this.setQuality(options.quality);
    this.setPalette(options.foreground, options.background);
    this.generate(options.layout);
    this.loadHand();
  }

  private setQuality(quality: MuseumQuality) {
    const width = QUALITY_WIDTH[quality];
    this.viewWidth = width;
    this.viewHeight = Math.round(width * 3 / 4);
    this.buffer.width = this.viewWidth;
    this.buffer.height = this.viewHeight;
    this.imageData = this.bufferCtx.createImageData(this.viewWidth, this.viewHeight);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
    this.bufferCtx.imageSmoothingEnabled = false;
  }

  setSettings(next: MuseumSettings) {
    const previous = this.settings;
    this.settings = next;
    if (previous.quality !== next.quality) this.setQuality(next.quality);
    if (previous.foreground !== next.foreground || previous.background !== next.background) {
      this.setPalette(next.foreground, next.background);
    }
    if (previous.layout !== next.layout) this.generate(next.layout);
    this.render();
  }

  setPaused(value: boolean) {
    this.paused = value;
    if (value) this.keys.clear();
  }
  setKey(key: string, pressed: boolean) {
    if (pressed) this.keys.add(key.toLowerCase());
    else this.keys.delete(key.toLowerCase());
  }
  clearKeys() { this.keys.clear(); }
  turn(delta: number) {
    if (!this.paused) this.player.angle += clamp(delta, -250, 250) * 0.0034;
  }
  getArt(index: number) { return this.artifacts[index] ?? null; }
  getFocusedArt() { return this.focus === null ? null : this.artifacts[this.focus] ?? null; }
  getFocusIndex() { return this.focus; }

  reach() {
    // The sprite contains two hands. Alternate, but render only ONE per reach.
    this.handSide = this.handSide === 'left' ? 'right' : 'left';
    this.handStart = performance.now();
    this.handUntil = this.handStart + 560;
    this.render();
  }

  start() {
    if (this.destroyed || this.raf) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    // Load artwork in the actual field of view first. A small prefetch is enough;
    // front-loading every token would delay newly visible paintings.
    for (let i = 0; i < Math.min(this.artifacts.length, 2); i++) this.requestTexture(i);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queue = [];
    this.keys.clear();
    this.textures.clear();
  }

  private tick = (now: number) => {
    if (this.destroyed) return;
    const dt = clamp((now - this.lastFrame) / 1000, 0, 0.05);
    this.lastFrame = now;
    if (!this.paused) this.move(dt);
    if (now - this.lastDraw > (this.settings.quality === 'full' ? 48 : 33) && (!this.paused || this.handUntil > now)) {
      this.render();
      this.lastDraw = now;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private setPalette(foreground: string, background: string) {
    this.fg = colour(foreground);
    this.bg = colour(background);
    this.tintHand();
  }

  private loadHand() {
    const image = new window.Image();
    image.onload = () => {
      if (this.destroyed) return;
      this.handSource = image;
      this.tintHand();
    };
    image.src = '/mintbay-museum-hands.png';
  }

  private tintHand() {
    const source = this.handSource;
    if (!source) return;
    const tinted = document.createElement('canvas');
    tinted.width = source.naturalWidth;
    tinted.height = source.naturalHeight;
    const g = tinted.getContext('2d');
    if (!g) return;
    g.drawImage(source, 0, 0);
    const bytes = g.getImageData(0, 0, tinted.width, tinted.height);
    const ink = rgb(this.settings?.foreground || '#ffffff');
    const shadow = rgb(this.settings?.background || '#000000');
    for (let i = 0; i < bytes.data.length; i += 4) {
      if (bytes.data[i + 3] === 0) continue;
      const bright = bytes.data[i + 1] > 120;
      const c = bright ? ink : shadow;
      bytes.data[i] = c[0]; bytes.data[i + 1] = c[1]; bytes.data[i + 2] = c[2];
    }
    g.putImageData(bytes, 0, 0);
    this.handTint = tinted;
  }

  private generate(layout: MuseumLayout) {
    const count = this.artifacts.length;
    if (layout === 'corridor') this.buildCorridor(count);
    else if (layout === 'labyrinth') this.buildLabyrinth(count);
    else this.buildAtrium(count);
    this.hangArt();
    this.focus = null;
    this.callbacks.onFocus(null);
    this.render();
  }

  private allocate(width: number, height: number) {
    this.mw = width; this.mh = height;
    this.map = new Uint8Array(width * height).fill(1);
  }
  private isFloor(x: number, y: number) {
    return x >= 0 && x < this.mw && y >= 0 && y < this.mh && this.map[y * this.mw + x] === 0;
  }
  private carve(x0: number, y0: number, x1: number, y1: number) {
    for (let y = Math.max(1, y0); y <= Math.min(this.mh - 2, y1); y++)
      for (let x = Math.max(1, x0); x <= Math.min(this.mw - 2, x1); x++) this.map[y * this.mw + x] = 0;
  }
  private wall(x: number, y: number) {
    if (x > 0 && y > 0 && x < this.mw - 1 && y < this.mh - 1) this.map[y * this.mw + x] = 1;
  }

  private buildCorridor(count: number) {
    const sections = Math.max(4, Math.ceil(count / 7));
    const w = sections * 12 + 8;
    this.allocate(w, 29);
    this.carve(3, 12, w - 4, 16); // The long central gallery.
    for (let i = 0; i < sections; i++) {
      const x = 5 + i * 12;
      this.carve(x, 3, x + 9, 11);
      this.carve(x, 17, x + 9, 25);
      this.carve(x + 4, 11, x + 5, 12);
      this.carve(x + 4, 16, x + 5, 17);
      // A square column in each chamber adds two-sided display surfaces.
      this.wall(x + 2, 6); this.wall(x + 2, 7);
      this.wall(x + 7, 21); this.wall(x + 7, 22);
    }
    this.player = { x: 4.5, y: 14.5, angle: 0 };
  }

  private buildAtrium(count: number) {
    // Expanding atrium, with freestanding display partitions and side wings.
    const bays = Math.max(3, Math.ceil(count / 12));
    const w = 16 + bays * 12;
    this.allocate(w, 39);
    this.carve(3, 7, w - 4, 31);
    for (let bay = 0; bay < bays; bay++) {
      const x = 12 + bay * 12;
      // Freestanding walls form varied sightlines, never blocking the main path.
      for (let yy = 12; yy <= 18; yy++) this.wall(x, yy);
      for (let yy = 20; yy <= 26; yy++) this.wall(x + 5, yy);
      this.wall(x + 1, 12); this.wall(x + 1, 13);
      this.wall(x + 6, 25); this.wall(x + 6, 26);
    }
    this.player = { x: 6.5, y: 19.5, angle: 0 };
  }

  private buildLabyrinth(count: number) {
    const cols = 3;
    const rows = Math.max(2, Math.ceil(count / 12 / cols));
    const stepX = 15, stepY = 15;
    this.allocate(cols * stepX + 4, rows * stepY + 4);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const px = 3 + x * stepX, py = 3 + y * stepY;
      this.carve(px, py, px + 12, py + 12);
      // Adjacent rooms connect through generous openings, but wall corners stay.
      if (x > 0) this.carve(px - 2, py + 5, px, py + 7);
      if (y > 0) this.carve(px + 5, py - 2, px + 7, py);
      // Short inner gallery walls create the intimate maze feeling.
      for (let k = 0; k < 5; k++) this.wall(px + (x % 2 ? 5 : 7), py + 4 + k);
    }
    this.player = { x: 7.5, y: 8.5, angle: 0 };
  }

  private hangArt() {
    const candidates: Array<WallSlot & { priority: number }> = [];
    const generator = rand(hash(this.owner + ':' + this.settings.layout));
    const faces: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]];
    for (let y = 1; y < this.mh - 1; y++) for (let x = 1; x < this.mw - 1; x++) {
      if (this.map[y * this.mw + x] !== 1) continue;
      for (const [dx, dy, face] of faces) {
        if (!this.isFloor(x + dx, y + dy)) continue;
        // A space immediately in front of the exhibit improves inspection.
        if (!this.isFloor(x + dx * 2, y + dy * 2)) continue;
        const dist = Math.hypot(x - this.player.x, y - this.player.y);
        candidates.push({ x, y, face, art: 0, priority: dist + generator() * 3 });
      }
    }
    candidates.sort((a, b) => a.priority - b.priority);
    const picked: WallSlot[] = [];
    const total = Math.min(this.artifacts.length, candidates.length);
    for (const separation of [2.8, 2.1, 1.4, 0]) {
      for (const c of candidates) {
        if (picked.length >= total) break;
        if (picked.some(p => p.x === c.x && p.y === c.y && p.face === c.face)) continue;
        if (separation > 0 && picked.some(p => Math.hypot(p.x - c.x, p.y - c.y) < separation)) continue;
        picked.push({ x: c.x, y: c.y, face: c.face, art: picked.length });
      }
    }
    // Open the museum facing a reachable painting, with the collector's newest
    // NFT first. This avoids starting inside a beautiful but apparently empty hall.
    const normals: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let entranceView: { at: number; angle: number; distance: number } | null = null;
    for (let i = 0; i < picked.length; i++) {
      const item = picked[i];
      const [nx, ny] = normals[item.face];
      const tx = item.x + 0.5 + nx * 0.5;
      const ty = item.y + 0.5 + ny * 0.5;
      const distance = Math.hypot(tx - this.player.x, ty - this.player.y);
      if (distance < 1.4 || distance > 9) continue;
      const angle = Math.atan2(ty - this.player.y, tx - this.player.x);
      const hit = this.cast(Math.cos(angle), Math.sin(angle));
      if (hit.x !== item.x || hit.y !== item.y || hit.face !== item.face) continue;
      if (!entranceView || Math.abs(distance - 5) < Math.abs(entranceView.distance - 5)) {
        entranceView = { at: i, angle, distance };
      }
    }
    if (entranceView) {
      const [primary] = picked.splice(entranceView.at, 1);
      picked.unshift(primary);
      this.player.angle = entranceView.angle;
    }
    picked.forEach((slot, index) => { slot.art = index; });
    this.facing = new Map(picked.map(s => [`${s.x},${s.y},${s.face}`, s.art]));
  }

  private blocked(x: number, y: number): boolean {
    const radius = 0.21;
    for (const yy of [y - radius, y + radius]) for (const xx of [x - radius, x + radius]) {
      if (!this.isFloor(Math.floor(xx), Math.floor(yy))) return true;
    }
    return false;
  }

  private move(dt: number) {
    const keys = this.keys;
    const turnSpeed = dt * 1.9;
    if (keys.has('arrowleft') || keys.has('q')) this.player.angle -= turnSpeed;
    if (keys.has('arrowright') || keys.has('e-turn')) this.player.angle += turnSpeed;
    const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const strafe = Number(keys.has('d')) - Number(keys.has('a'));
    const speed = dt * (keys.has('shift') ? 5.5 : 3.45);
    const a = this.player.angle;
    const dx = (Math.cos(a) * forward - Math.sin(a) * strafe) * speed;
    const dy = (Math.sin(a) * forward + Math.cos(a) * strafe) * speed;
    if (dx && !this.blocked(this.player.x + dx, this.player.y)) this.player.x += dx;
    if (dy && !this.blocked(this.player.x, this.player.y + dy)) this.player.y += dy;
  }

  private cast(rayX: number, rayY: number): RayHit {
    let x = Math.floor(this.player.x), y = Math.floor(this.player.y);
    const ddx = Math.abs(1 / (rayX || 0.00000001)), ddy = Math.abs(1 / (rayY || 0.00000001));
    const sx = rayX < 0 ? -1 : 1, sy = rayY < 0 ? -1 : 1;
    let sdx = (rayX < 0 ? this.player.x - x : x + 1 - this.player.x) * ddx;
    let sdy = (rayY < 0 ? this.player.y - y : y + 1 - this.player.y) * ddy;
    let side = 0;
    for (let tries = 0; tries < 200; tries++) {
      if (sdx < sdy) { sdx += ddx; x += sx; side = 0; }
      else { sdy += ddy; y += sy; side = 1; }
      if (!this.isFloor(x, y)) break;
    }
    const distance = side === 0
      ? (x - this.player.x + (1 - sx) / 2) / (rayX || 0.00000001)
      : (y - this.player.y + (1 - sy) / 2) / (rayY || 0.00000001);
    let u = side === 0 ? this.player.y + distance * rayY : this.player.x + distance * rayX;
    u -= Math.floor(u);
    if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) u = 1 - u;
    const face = side === 0 ? (rayX > 0 ? 1 : 0) : (rayY > 0 ? 3 : 2);
    return { x, y, face, u, distance: Math.max(0.05, distance), side };
  }

  private requestTexture(index: number) {
    const asset = this.artifacts[index];
    if (!asset || this.requested.has(index) || this.destroyed) return;
    this.requested.add(index);
    this.textures.set(index, { image: null, tile: null, backing: 'fg', status: 'queued', touched: performance.now() });
    this.queue.push(index);
    this.pumpTextures();
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new window.Image();
      image.decoding = 'async';
      // No crossOrigin is needed: the 3D renderer draws image pixels but never
      // reads their source canvas or exports it. Avoid rejecting valid HTTPS art.
      let finished = false;
      const timer = window.setTimeout(() => finish(new Error('Artwork image timeout')), IMAGE_TIMEOUT);
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else if (image.naturalWidth && image.naturalHeight) resolve(image);
        else reject(new Error('Artwork image has no dimensions'));
      };
      image.onload = () => finish();
      image.onerror = () => finish(new Error('Artwork image could not be decoded'));
      image.src = url;
    });
  }

  private makeArtTile(image: HTMLImageElement): HTMLCanvasElement {
    const tile = document.createElement('canvas');
    tile.width = ART_TEXTURE_SIZE;
    tile.height = ART_TEXTURE_SIZE;
    const g = tile.getContext('2d');
    if (!g) throw new Error('Artwork texture canvas is unavailable');
    g.imageSmoothingEnabled = false;
    // Always CONTAIN inside the square wall mount. Never crop a wide, portrait,
    // SVG, or low-resolution NFT. Transparent areas reveal the backing colour.
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const ratio = w / h;
    const targetW = ratio > 1 ? ART_TEXTURE_SIZE : ART_TEXTURE_SIZE * ratio;
    const targetH = ratio > 1 ? ART_TEXTURE_SIZE / ratio : ART_TEXTURE_SIZE;
    g.clearRect(0, 0, ART_TEXTURE_SIZE, ART_TEXTURE_SIZE);
    g.drawImage(image, (ART_TEXTURE_SIZE - targetW) / 2, (ART_TEXTURE_SIZE - targetH) / 2, targetW, targetH);
    return tile;
  }

  private artworkBacking(image: HTMLImageElement): 'fg' | 'bg' {
    // For readable on-chain data SVGs/PNGs, choose the opposing two-colour mount
    // so transparent white art also remains visible. Remote images without CORS
    // are still drawn; a failed pixel read simply chooses the white/ink backing.
    try {
      const preview = document.createElement('canvas');
      preview.width = 32;
      preview.height = 32;
      const g = preview.getContext('2d', { willReadFrequently: true });
      if (!g) return 'fg';
      g.drawImage(image, 0, 0, 32, 32);
      const rgba = g.getImageData(0, 0, 32, 32).data;
      let bright = 0, weight = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3] / 255;
        if (alpha < 0.25) continue;
        bright += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) * alpha;
        weight += alpha;
      }
      return weight > 0 && bright / weight > 160 ? 'bg' : 'fg';
    } catch {
      return 'fg';
    }
  }

  /** Canonical on-chain metadata via a route Mintbay already uses for NFT previews. */
  private async canonicalImage(index: number): Promise<string | null> {
    const asset = this.artifacts[index];
    if (!asset || !/^0x[a-fA-F0-9]{40}$/.test(asset.contract) || !/^\d{1,78}$/.test(asset.tokenId)) return null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CANONICAL_TIMEOUT);
    try {
      const q = new URLSearchParams({
        source: asset.contract,
        tokenId: asset.tokenId,
        chainId: String(asset.chainId || 4663),
      });
      const res = await fetch(`/api/mintbay/mint-preview?${q}`, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) return null;
      const data: unknown = await res.json();
      if (!data || typeof data !== 'object' || !('image' in data)) return null;
      const src = data.image;
      return typeof src === 'string' && (/^data:image\//i.test(src) || /^https:\/\//i.test(src)) ? src : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  private async fetchTexture(index: number, entry: TextureEntry): Promise<void> {
    const asset = this.artifacts[index];
    if (!asset) return;
    let canonicalLoaded = false;
    const setImage = (image: HTMLImageElement, canonical: boolean) => {
      if (this.destroyed || this.textures.get(index) !== entry || (!canonical && canonicalLoaded)) return;
      try {
        // Normalise image format once, keeping original aspect ratio and the
        // original palette. The source tile is ONLY used for drawing, never read.
        const tile = this.makeArtTile(image);
        entry.image = image;
        entry.tile = tile;
        entry.backing = this.artworkBacking(image);
        entry.status = 'ready';
        entry.touched = performance.now();
        if (canonical) canonicalLoaded = true;
        this.callbacks.onArtProgress(
          [...this.textures.values()].filter(v => v.status === 'ready').length,
          this.artifacts.length,
        );
        this.render();
      } catch (error) {
        console.warn('[mintbay-museum] Could not prepare NFT texture', asset.contract, asset.tokenId, error);
      }
    };

    // The Alchemy image can appear immediately while the original tokenURI is
    // retrieved. If on-chain metadata resolves, it replaces the cached preview.
    const cachedImage = asset.image
      ? this.loadImage(asset.image).then(image => setImage(image, false)).catch(() => {})
      : Promise.resolve();
    const canonical = this.canonicalImage(index).then(async src => {
      if (!src || this.destroyed) return;
      // Avoid reloading an identical data URL; if the original failed however,
      // retrying through the canonical path can still recover a transient error.
      if (src === asset.image && entry.status === 'ready') return;
      try { setImage(await this.loadImage(src), true); } catch { /* keep Alchemy preview */ }
    });
    await Promise.allSettled([cachedImage, canonical]);
    if (this.destroyed || this.textures.get(index) !== entry) return;
    if (entry.status !== 'ready') {
      entry.status = 'failed';
      // An explicit missing-image tile is preferable to a deceptively empty frame.
      console.warn('[mintbay-museum] No renderable NFT image', asset.contract, asset.tokenId);
      this.render();
    }
  }

  private pumpTextures() {
    while (!this.destroyed && this.pending < MAX_LOADING && this.queue.length) {
      const index = this.queue.shift()!;
      const entry = this.textures.get(index);
      if (!entry) continue;
      this.pending++;
      entry.status = 'loading';
      void this.fetchTexture(index, entry).finally(() => {
        this.pending = Math.max(0, this.pending - 1);
        if (this.destroyed) return;
        if (this.textures.size > MAX_CACHE) {
          const victims = [...this.textures.entries()]
            .filter(([, v]) => v.status !== 'loading' && v.status !== 'queued')
            .sort((a, b) => a[1].touched - b[1].touched);
          for (const [id] of victims.slice(0, this.textures.size - MAX_CACHE)) {
            this.textures.delete(id);
            this.requested.delete(id);
          }
        }
        this.pumpTextures();
      });
    }
  }

  private render() {
    if (this.destroyed || !this.map.length) return;
    const W = this.viewWidth, H = this.viewHeight;
    this.pixels.fill(this.bg);
    const ca = Math.cos(this.player.angle), sa = Math.sin(this.player.angle);
    const planeX = -sa * FOV, planeY = ca * FOV;
    const dissolve = clamp(this.settings.dither / 100, 0, 1);
    // Run the original 4x4 Bayer matrix at the SELECTED render resolution.
    // At 320x240 this matches the HTML pixel spacing exactly; 640/960/1280
    // progressively increase detail instead of repeating the 320px pattern.
    const originalBlend = (1 - dissolve) / (1 - ORIGINAL_SLIDER);
    const solidBlend = Math.pow(1 - dissolve, 10);
    const overlays: Array<{
      x: number; y: number; height: number; source: HTMLCanvasElement; sx: number;
    }> = [];
    const unloaded = new Map<number, { x0: number; x1: number; y: number; status: TextureEntry['status'] | 'queued' }>();
    let lookedAt: number | null = null;

    for (let x = 0; x < W; x++) {
      const cameraX = 2 * (x + 0.5) / W - 1;
      const hit = this.cast(ca + planeX * cameraX, sa + planeY * cameraX);
      const height = Math.min(H * 8, H / hit.distance);
      const top = (H - height) / 2;
      const yStart = Math.max(0, Math.ceil(top));
      const yEnd = Math.min(H, Math.ceil(top + height));
      // Original museum wall shading, including its low-contrast surface seam.
      const shade = clamp(0.7 - hit.distance * 0.045 - (hit.side ? 0.12 : 0), 0.04, 0.96);
      const seam = Math.floor(hit.u * 8) % 8 === 0 ? 0.88 : 1;
      const artIndex = this.facing.get(`${hit.x},${hit.y},${hit.face}`);
      const localU = (hit.u - 0.5) / FRAME_SIZE + 0.5;
      const hasFrame = artIndex !== undefined && localU >= 0 && localU < 1;
      if (x === Math.floor(W / 2) && hasFrame && hit.distance < 3.5) lookedAt = artIndex ?? null;
      const entry = artIndex !== undefined && hasFrame ? this.textures.get(artIndex) : undefined;
      if (artIndex !== undefined && hasFrame && !entry) this.requestTexture(artIndex);
      const tile = entry?.status === 'ready' ? entry.tile : null;
      if (tile && entry) entry.touched = performance.now();
      const bx = x & 3;

      for (let y = yStart; y < yEnd; y++) {
        const v = (y + 0.5 - top) / height;
        const by = y & 3;
        const b = shade * (v < 0.018 || v > 0.982 ? 0.58 : 1) * seam;
        // 22% reproduces the HTML museum's Bayer density and depth-shading.
        // Near 0% the walls quickly become solid; at 100% they vanish entirely.
        // Thresholds remain exactly BAYER[y][x]/16, NOT the finer midpoint mesh.
        const density = Math.max(solidBlend, b * ORIGINAL_GAIN * originalBlend);
        let on = dissolve === 0 || (dissolve < 1 && density > BAYER[by][bx] / 16);
        if (hasFrame) {
          const localV = (v - 0.5) / FRAME_SIZE + 0.5;
          if (localV >= 0 && localV < 1) {
            const edge = 0.055;
            const imageEdge = (1 - ART_FILL) / 2;
            if (localU < edge || localU > 1 - edge || localV < edge || localV > 1 - edge) on = true;
            else if (localU < imageEdge || localU > 1 - imageEdge || localV < imageEdge || localV > 1 - imageEdge) on = false;
            else on = entry?.backing === 'bg' ? false : true; // Two-colour backing contrasts the artwork.
          }
        }
        this.pixels[y * W + x] = on ? this.fg : this.bg;
      }
      if (hasFrame && artIndex !== undefined) {
        const artWorld = FRAME_SIZE * ART_FILL;
        const normalU = (hit.u - (0.5 - artWorld / 2)) / artWorld;
        if (normalU >= 0 && normalU < 1) {
          if (tile) {
            overlays.push({
              x,
              y: Math.round(top + height * (0.5 - artWorld / 2)),
              height: Math.max(1, Math.round(height * artWorld)),
              source: tile,
              // The raycaster's U coordinate runs right-to-left in screen space
              // for all four wall faces. Reverse it, as in the original HTML
              // museum (tx = 19 - (gx - 2)), to keep artwork readable.
              // Y remains top-to-bottom: never flip the image upside-down.
              sx: tile.width - 1 - Math.min(tile.width - 1, Math.floor(normalU * tile.width)),
            });
          } else {
            const previous = unloaded.get(artIndex);
            if (previous) previous.x1 = x;
            else unloaded.set(artIndex, { x0: x, x1: x, y: Math.round(H / 2), status: entry?.status || 'queued' });
          }
        }
      }
    }

    if (lookedAt !== this.focus) {
      this.focus = lookedAt;
      this.callbacks.onFocus(lookedAt);
    }
    this.bufferCtx.putImageData(this.imageData, 0, 0);
    this.bufferCtx.imageSmoothingEnabled = false;
    for (const part of overlays) {
      try {
        this.bufferCtx.drawImage(part.source, part.sx, 0, 1, part.source.height,
          part.x, part.y, 1, part.height);
      } catch (error) {
        // No pixel-readback: valid cross-origin artwork can still be displayed.
        console.warn('[mintbay-museum] Artwork draw failed', error);
      }
    }
    // A painting with no available metadata is labelled instead of becoming a
    // featureless empty black rectangle that looks like an NFT rendering bug.
    this.bufferCtx.fillStyle = this.settings.background;
    this.bufferCtx.textAlign = 'center';
    this.bufferCtx.textBaseline = 'middle';
    this.bufferCtx.font = `${Math.max(9, Math.round(W / 80))}px monospace`;
    for (const [index, box] of unloaded) {
      const x = (box.x0 + box.x1) / 2;
      if (box.x1 - box.x0 < 27) continue;
      this.bufferCtx.fillText(box.status === 'failed' ? 'NO IMAGE' : 'LOADING', x, box.y);
      const token = this.artifacts[index];
      if (token) this.bufferCtx.fillText(`#${token.tokenId}`, x, box.y + Math.max(12, Math.round(W / 62)));
    }
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buffer, 0, 0, W, H, 0, 0, 1280, 960);
    const now = performance.now();
    if (this.handTint && this.handUntil > now) {
      const t = clamp((now - this.handStart) / 560, 0, 1);
      const shift = Math.round(Math.sin(Math.PI * t) * 110);
      const sourceWidth = Math.floor(this.handTint.width / 2);
      const sourceX = this.handSide === 'right' ? sourceWidth : 0;
      const drawWidth = 544, drawHeight = 816;
      const drawX = this.handSide === 'right' ? 1280 - drawWidth + 5 : -5;
      const drawY = 960 - drawHeight + 88 - shift;
      this.ctx.globalAlpha = clamp(Math.min(t * 8, (1 - t) * 5), 0, 1);
      this.ctx.drawImage(this.handTint, sourceX, 0, sourceWidth, this.handTint.height,
        drawX, drawY, drawWidth, drawHeight);
      this.ctx.globalAlpha = 1;
    }
  }

}
