/** Compile the editable Mintbay JSON pixels into lossless, transparent PNG traits.
 * This is an additive deployment artifact. artwork.json remains the canonical editor source.
 */
export type PngProject = {
  gridSize: number;
  layers: Array<{ id: string; name: string; traits: Array<{ id: string; name: string; pixels: string[] }> }>;
};
export type PngAssetRecord = {
  traitId: string;
  layerId: string;
  layerIndex: number;
  traitIndex: number;
  path: string;
  mimeType: 'image/png';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};
export type PngManifest = {
  schemaVersion: 1;
  format: 'mintbay-png-assets-v1';
  gridSize: number;
  assets: PngAssetRecord[];
};
function hex(data: ArrayBuffer): string {
  return Array.from(new Uint8Array(data), b => b.toString(16).padStart(2, '0')).join('');
}
/** Encode the canonical pixel RGB bytes directly into PNG (RGBA8).
 * Avoid HTMLCanvasElement.toBlob(), which may color-convert pixel values.
 * CompressionStream('deflate') produces the PNG IDAT zlib stream.
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}
function pngChunk(name: string, contents: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const crcInput = new Uint8Array(4 + contents.length);
  crcInput.set(nameBytes);
  crcInput.set(contents, 4);
  const chunk = new Uint8Array(12 + contents.length);
  chunk.set(u32(contents.length));
  chunk.set(crcInput, 4);
  chunk.set(u32(crc32(crcInput)), contents.length + 8);
  return chunk;
}
async function encodeExactPng(width: number, height: number, colors: string[]): Promise<Blob> {
  // PNG row filter type 0: all RGBA channels are stored exactly as specified.
  const scanlines = new Uint8Array(height * (1 + 4 * width));
  const stride = 1 + 4 * width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = colors[y * width + x];
      const p = y * stride + 1 + x * 4;
      if (color === 'transparent') continue;
      scanlines[p] = parseInt(color.slice(1, 3), 16);
      scanlines[p + 1] = parseInt(color.slice(3, 5), 16);
      scanlines[p + 2] = parseInt(color.slice(5, 7), 16);
      scanlines[p + 3] = 255;
    }
  }
  if (typeof CompressionStream === 'undefined') {
    throw new Error('This browser does not support CompressionStream(deflate), required for exact-color PNG encoding');
  }
  // BlobPart must use a guaranteed ArrayBuffer (not ArrayBufferLike).
  // TypeScript's newer typed-array definitions otherwise allow SharedArrayBuffer.
  const scanlineBuffer = new ArrayBuffer(scanlines.byteLength);
  new Uint8Array(scanlineBuffer).set(scanlines);
  const compressed = await new Response(
    new Blob([scanlineBuffer]).stream().pipeThrough(new CompressionStream('deflate'))
  ).arrayBuffer();
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; // Bit depth 8
  ihdr[9] = 6; // RGBA truecolor with alpha
  // Compression, filter, interlace are all zero.
  const signature = new Uint8Array([137,80,78,71,13,10,26,10]);
  // Assemble into a real ArrayBuffer for strict DOM BlobPart typing.
  const parts = [signature, pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(compressed)), pngChunk('IEND', new Uint8Array())];
  const output = new ArrayBuffer(parts.reduce((sum, part) => sum + part.byteLength, 0));
  const bytes = new Uint8Array(output);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new Blob([output], { type: 'image/png' });
}
/** Canonicalize Studio colors without mutating the editable project.
 * The existing Studio PNG import writes rgb(r, g, b), while V6 accepts #RRGGBB.
 */
export function canonicalPixelColor(value: string): string {
  if (value === 'transparent') return value;
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value)) {
    const v = value.slice(1).toLowerCase();
    return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  }
  const match = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(value);
  if (match) {
    const rgb = match.slice(1).map(Number);
    if (rgb.every(x => x >= 0 && x <= 255)) {
      return '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
    }
  }
  throw new Error(`Unsupported pixel color: ${value}. Use #RRGGBB or rgb(r, g, b).`);
}

/** Produces the canonical artwork sent to the existing V6 Worker compiler.
 * It preserves layer order, IDs, weights and exclusions.
 */
export function canonicalizePngProject<T extends PngProject>(project: T): T {
  return {
    ...project,
    layers: project.layers.map(layer => ({
      ...layer,
      traits: layer.traits.map(trait => ({
        ...trait,
        pixels: trait.pixels.map((pixel, index) => {
          try { return canonicalPixelColor(pixel); }
          catch (error) {
            throw new Error(`Invalid pixel color in ${layer.name} / ${trait.name} at pixel ${index}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }),
      })),
    })),
  } as T;
}

export async function compilePngAssets(project: PngProject): Promise<{ manifest: PngManifest; files: Blob[]; totalBytes: number }> {
  const n = project.gridSize;
  if (!Number.isInteger(n) || n < 2 || n > 128) throw new Error('Invalid artwork grid size');
  const records: PngAssetRecord[] = [];
  const files: Blob[] = [];
  let totalBytes = 0;
  for (let li = 0; li < project.layers.length; li++) {
    const layer = project.layers[li];
    for (let ti = 0; ti < layer.traits.length; ti++) {
      const trait = layer.traits[ti];
      if (trait.pixels.length !== n * n) throw new Error(`Wrong pixel count in ${layer.name} / ${trait.name}`);
      for (let p = 0; p < trait.pixels.length; p++) {
        const color = trait.pixels[p];
        if (color !== 'transparent' && !/^#[0-9a-f]{6}$/i.test(color)) {
          throw new Error(`Invalid pixel color in ${layer.name} / ${trait.name} at pixel ${p}: ${color}`);
        }
      }
      const blob = await encodeExactPng(n, n, trait.pixels);
      const data = await blob.arrayBuffer();
      const index = records.length;
      const path = `assets/${String(index).padStart(6, '0')}.png`;
      records.push({ traitId: trait.id, layerId: layer.id, layerIndex: li, traitIndex: ti,
        path, mimeType: 'image/png', width: n, height: n, bytes: data.byteLength,
        sha256: hex(await crypto.subtle.digest('SHA-256', data)) });
      files.push(blob);
      totalBytes += data.byteLength;
    }
  }
  if (!files.length) throw new Error('No artwork traits to compile');
  return { manifest: { schemaVersion: 1, format: 'mintbay-png-assets-v1', gridSize: n, assets: records }, files, totalBytes };
}
