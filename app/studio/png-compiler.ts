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
function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
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
      const canvas = document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) throw new Error('Canvas is unavailable');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, n, n);
      for (let p = 0; p < trait.pixels.length; p++) {
        const color = trait.pixels[p];
        if (color === 'transparent') continue;
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`Invalid pixel color in ${layer.name} / ${trait.name}`);
        ctx.fillStyle = color;
        ctx.fillRect(p % n, Math.floor(p / n), 1, 1);
      }
      const blob = await pngBlob(canvas);
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
