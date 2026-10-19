// app/2d/page.tsx

"use client";

import React, { useMemo, useRef, useState } from "react";
import OnchainExportPanel from "./OnchainExportPanel";

const LOCAL_STORAGE_KEY = "pixel-collection-maker-v2";
const MAX_HISTORY = 60;
const MAX_GENERATE_ATTEMPTS_MULTIPLIER = 100;
const MAX_COMBINATION_COUNT = 100_001; // Exact until this cap, then show a lower bound.
const RULE_ANALYSIS_BUDGET = 250_000;
const LOSPEC_LIST = "https://lospec.com/palette-list";

type Tab = "design" | "collection" | "share" | "onchain";
type Tool = "paint" | "erase" | "bucket" | "move" | "select";
type Theme = "light" | "dark";
type RarityKey = "superRare" | "rare" | "epic" | "common" | "veryCommon";
type ShareBackground = "white" | "black" | "transparent" | "custom";

type Trait = {
  id: string;
  name: string;
  rarity: RarityKey;
  weight: number;
  pixels: string[];
  incompatibleWith: string[];
};

type Layer = {
  id: string;
  name: string;
  traits: Trait[];
  activeTraitId: string;
  open: boolean;
  visible: boolean;
  onion: boolean;
};

type Project = {
  name: string;
  gridSize: number;
  supply: number;
  layers: Layer[];
  updatedAt: string;
};

type Selection = {
  start: number;
  end: number;
};

type ClipboardArea = {
  width: number;
  height: number;
  pixels: string[];
};

type GeneratedItem = {
  id: number;
  comboKey: string;
  traitIds: Record<string, string>;
  pixels: string[];
};

type ShareSettings = {
  grid: number;
  frame: number;
  outerMargin: number;
  tokenScale: number;
  background: ShareBackground;
  customBackground: string;
  exportScale: number;
};

const rarityOptions: {
  key: RarityKey;
  label: string;
  short: string;
  weight: number;
}[] = [
  { key: "superRare", label: "Super Rare", short: "SR", weight: 3 },
  { key: "rare", label: "Rare", short: "R", weight: 10 },
  { key: "epic", label: "Epic", short: "E", weight: 25 },
  { key: "common", label: "Common", short: "C", weight: 60 },
  { key: "veryCommon", label: "Very Common", short: "VC", weight: 100 },
];

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function emptyPixels(size: number) {
  return Array(size * size).fill("transparent");
}

function makeTrait(index: number, gridSize: number): Trait {
  return {
    id: uid("trait"),
    name: index === 0 ? "Default" : `Trait ${index + 1}`,
    rarity: "veryCommon",
    weight: 100,
    pixels: emptyPixels(gridSize),
    incompatibleWith: [],
  };
}

function makeLayer(name: string, gridSize: number): Layer {
  const trait = makeTrait(0, gridSize);

  return {
    id: uid("layer"),
    name,
    traits: [trait],
    activeTraitId: trait.id,
    open: true,
    visible: true,
    onion: false,
  };
}

function makeInitialProject(): Project {
  return {
    name: "Pixel Collection",
    gridSize: 8,
    supply: 100,
    layers: [
      makeLayer("Background", 8),
    ],
    updatedAt: new Date().toISOString(),
  };
}

function resizePixels(pixels: string[], oldSize: number, newSize: number) {
  const resized = emptyPixels(newSize);
  const copySize = Math.min(oldSize, newSize);

  for (let y = 0; y < copySize; y++) {
    for (let x = 0; x < copySize; x++) {
      resized[y * newSize + x] = pixels[y * oldSize + x] ?? "transparent";
    }
  }

  return resized;
}

function normalizeProject(input: Partial<Project>): Project {
  const fallback = makeInitialProject();
  const gridSize = clampNumber(
    Number(input.gridSize ?? fallback.gridSize),
    2,
    128,
  );
  const layersInput =
    Array.isArray(input.layers) && input.layers.length
      ? input.layers
      : fallback.layers;

  const layers = layersInput.map((layerInput, layerIndex) => {
    const rawTraits =
      Array.isArray(layerInput.traits) && layerInput.traits.length
        ? layerInput.traits
        : [makeTrait(0, gridSize)];

    const traits = rawTraits.map((traitInput, traitIndex) => {
      const rarity = rarityOptions.some(
        (item) => item.key === traitInput.rarity,
      )
        ? traitInput.rarity
        : "veryCommon";
      // Preserve custom weights from artwork.json. Rarity labels are presets,
      // not an instruction to overwrite the saved on-chain generation weights.
      const storedWeight = Number(traitInput.weight);
      const weight =
        traitInput.weight !== undefined &&
        Number.isFinite(storedWeight) && storedWeight >= 0
          ? Math.floor(storedWeight)
          : (rarityOptions.find((item) => item.key === rarity)?.weight ?? 100);
      const oldPixels = Array.isArray(traitInput.pixels)
        ? traitInput.pixels
        : [];
      const oldSize = Math.max(
        1,
        Math.round(Math.sqrt(oldPixels.length || gridSize * gridSize)),
      );

      return {
        id: traitInput.id || uid("trait"),
        name:
          traitInput.name ||
          (traitIndex === 0 ? "Default" : `Trait ${traitIndex + 1}`),
        rarity,
        weight,
        pixels: resizePixels(
          oldPixels.length ? oldPixels : emptyPixels(gridSize),
          oldSize,
          gridSize,
        ),
        incompatibleWith: Array.isArray(traitInput.incompatibleWith)
          ? traitInput.incompatibleWith
          : Array.isArray(
                (
                  traitInput as unknown as {
                    rules?: { incompatibleWith?: string[] };
                  }
                ).rules?.incompatibleWith,
              )
            ? (
                traitInput as unknown as {
                  rules: { incompatibleWith: string[] };
                }
              ).rules.incompatibleWith
            : [],
      };
    });

    const activeTraitId = traits.some(
      (trait) => trait.id === layerInput.activeTraitId,
    )
      ? layerInput.activeTraitId
      : traits[0].id;

    return {
      id: layerInput.id || uid("layer"),
      name: layerInput.name || `Layer ${layerIndex + 1}`,
      traits,
      activeTraitId,
      open: layerInput.open ?? true,
      visible: layerInput.visible ?? true,
      onion: layerInput.onion ?? false,
    };
  });

  return {
    name: input.name || fallback.name,
    gridSize,
    supply: clampNumber(Number(input.supply ?? fallback.supply), 1, 10000),
    layers,
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

function colorWithAlpha(color: string, alpha: number) {
  if (color === "transparent") return color;

  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }

  return color;
}

function normalizeColor(r: number, g: number, b: number, a: number) {
  if (a < 20) return "transparent";
  const step = 16;
  const nr = Math.round(r / step) * step;
  const ng = Math.round(g / step) * step;
  const nb = Math.round(b / step) * step;
  return `rgb(${Math.min(nr, 255)}, ${Math.min(ng, 255)}, ${Math.min(nb, 255)})`;
}

function movePixels(pixels: string[], size: number, dx: number, dy: number) {
  const moved = emptyPixels(size);

  pixels.forEach((pixel, index) => {
    if (pixel === "transparent") return;
    const x = index % size;
    const y = Math.floor(index / size);
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) return;
    moved[ny * size + nx] = pixel;
  });

  return moved;
}

function boundsFromSelection(selection: Selection | null, size: number) {
  if (!selection) return null;

  const startX = selection.start % size;
  const startY = Math.floor(selection.start / size);
  const endX = selection.end % size;
  const endY = Math.floor(selection.end / size);

  return {
    x1: Math.min(startX, endX),
    y1: Math.min(startY, endY),
    x2: Math.max(startX, endX),
    y2: Math.max(startY, endY),
  };
}

function isIndexSelected(
  index: number,
  selection: Selection | null,
  size: number,
) {
  const bounds = boundsFromSelection(selection, size);
  if (!bounds) return false;
  const x = index % size;
  const y = Math.floor(index / size);
  return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
}

function drawPixelsToCanvas(
  canvas: HTMLCanvasElement,
  pixels: string[],
  size: number,
  pixelScale: number,
  background = "transparent",
) {
  canvas.width = Math.max(1, Math.round(size * pixelScale));
  canvas.height = Math.max(1, Math.round(size * pixelScale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  pixels.forEach((pixel, index) => {
    if (pixel === "transparent") return;
    const x = index % size;
    const y = Math.floor(index / size);
    ctx.fillStyle = pixel;
    ctx.fillRect(
      Math.round(x * pixelScale),
      Math.round(y * pixelScale),
      Math.ceil(pixelScale),
      Math.ceil(pixelScale),
    );
  });
}

function drawItemIntoRect(
  ctx: CanvasRenderingContext2D,
  item: GeneratedItem,
  size: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const itemCanvas = document.createElement("canvas");
  drawPixelsToCanvas(itemCanvas, item.pixels, size, 1, "transparent");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(itemCanvas, x, y, width, height);
}

// Rules are symmetric at generation time: blocking either direction rejects the pair.
// Invisible layers do not take part in preview generation, matching the existing editor.
function selectableLayers(project: Project): Layer[] {
  return project.layers.filter((layer) => layer.visible);
}

function compatibleTrait(a: Trait, b: Trait): boolean {
  return !a.incompatibleWith.includes(b.id) && !b.incompatibleWith.includes(a.id);
}

function weightedRandomOrder(candidates: Trait[]): Trait[] {
  const remaining = [...candidates];
  const result: Trait[] = [];
  while (remaining.length) {
    const total = remaining.reduce((sum, trait) => sum + trait.weight, 0);
    if (total <= 0) break;
    let roll = Math.random() * total;
    let chosen = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= remaining[i].weight;
      if (roll < 0) { chosen = i; break; }
    }
    result.push(remaining.splice(chosen, 1)[0]);
  }
  return result;
}

// Backtracks instead of picking an incompatible fallback. A valid complete combination
// always satisfies every incompatibility, including restrictions on later layers.
function chooseValidTraits(project: Project): Trait[] | null {
  const layers = selectableLayers(project);
  if (!layers.length) return null;

  let searchSteps = 0;
  function pick(index: number, chosen: Trait[]): Trait[] | null {
    if (++searchSteps > RULE_ANALYSIS_BUDGET) return null;
    if (index === layers.length) return chosen;
    const candidates = layers[index].traits.filter(
      (trait) => trait.weight > 0 && chosen.every((other) => compatibleTrait(trait, other)),
    );
    for (const candidate of weightedRandomOrder(candidates)) {
      const result = pick(index + 1, [...chosen, candidate]);
      if (result) return result;
    }
    return null;
  }
  return pick(0, []);
}

function generateOneItem(project: Project, id: number): GeneratedItem | null {
  const layers = selectableLayers(project);
  const traits = chooseValidTraits(project);
  if (!traits) return null;
  const pixels = emptyPixels(project.gridSize);
  const traitIds: Record<string, string> = {};

  layers.forEach((layer, index) => {
    const trait = traits[index];
    traitIds[layer.id] = trait.id;
    trait.pixels.forEach((pixel, pixelIndex) => {
      if (pixel !== "transparent") pixels[pixelIndex] = pixel;
    });
  });
  const comboKey = layers.map((layer) => traitIds[layer.id]).join("|");
  return { id, comboKey, traitIds, pixels };
}

type RuleAnalysis = {
  errors: string[];
  warnings: string[];
  combinations: number;
  capped: boolean;
  rules: number;
};

function analyzeRules(project: Project): RuleAnalysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const layers = selectableLayers(project);
  const all = project.layers.flatMap((layer) => layer.traits);
  const byId = new Map(all.map((trait) => [trait.id, trait]));
  const layerByTrait = new Map(project.layers.flatMap((layer) => layer.traits.map((trait) => [trait.id, layer.id] as const)));
  let rules = 0;

  if (!layers.length) errors.push("No visible layers. Enable at least one layer.");
  for (const layer of layers) {
    if (!layer.traits.some((trait) => trait.weight > 0)) errors.push(`Layer "${layer.name}" has no selectable traits (weight > 0).`);
  }
  for (const layer of project.layers) {
    for (const trait of layer.traits) {
      if (!Number.isInteger(trait.weight) || trait.weight < 0) errors.push(`"${layer.name} / ${trait.name}" has an invalid weight.`);
      for (const blockedId of trait.incompatibleWith) {
        rules++;
        if (!byId.has(blockedId)) errors.push(`"${layer.name} / ${trait.name}" blocks a missing trait ID.`);
        else if (blockedId === trait.id) errors.push(`"${layer.name} / ${trait.name}" blocks itself.`);
        else if (layerByTrait.get(blockedId) === layer.id) warnings.push(`"${layer.name} / ${trait.name}" blocks a trait in its own layer (these never co-occur).`);
      }
    }
  }
  if (project.layers.some((layer) => !layer.visible)) warnings.push("Hidden layers are ignored in Studio generation but remain in artwork.json. Confirm the on-chain renderer uses the same rule.");

  let visits = 0;
  let combinations = 0;
  function count(index: number, chosen: Trait[]): void {
    if (combinations >= MAX_COMBINATION_COUNT || visits >= RULE_ANALYSIS_BUDGET) return;
    visits++;
    if (index === layers.length) { combinations++; return; }
    for (const trait of layers[index].traits) {
      if (trait.weight <= 0 || !chosen.every((other) => compatibleTrait(trait, other))) continue;
      count(index + 1, [...chosen, trait]);
      if (combinations >= MAX_COMBINATION_COUNT || visits >= RULE_ANALYSIS_BUDGET) break;
    }
  }
  if (layers.length) count(0, []);
  const capped = combinations >= MAX_COMBINATION_COUNT || visits >= RULE_ANALYSIS_BUDGET;
  if (!combinations && !capped) errors.push("No valid trait combinations exist. Adjust the compatibility rules.");
  if (!capped && combinations > 0 && combinations < project.supply) warnings.push(`Only ${combinations} valid unique combinations exist for a supply of ${project.supply}.`);
  if (capped) warnings.push("Valid combination count reached the analysis limit; the displayed count is a lower bound.");
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], combinations, capped, rules };
}

function parsePaletteColors(text: string): string[] {
  const matches = text.match(/#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g) ?? [];
  return [...new Set(matches.map((match) => {
    const hex = match.replace("#", "").toLowerCase();
    return hex.length === 3 ? `#${hex.split("").map((ch) => ch + ch).join("")}` : `#${hex}`;
  }))];
}

function lospecPaletteSlug(text: string): string | null {
  try {
    const url = new URL(text.trim());
    if (url.hostname !== "lospec.com" && url.hostname !== "www.lospec.com") return null;
    const match = url.pathname.match(/^\/palette-list\/([a-zA-Z0-9-]+)(?:\.json)?\/?$/);
    return match ? match[1] : null;
  } catch { return null; }
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function drawTraitToCanvas(
  canvas: HTMLCanvasElement,
  trait: Trait,
  size: number,
) {
  drawPixelsToCanvas(canvas, trait.pixels, size, 1, "transparent");
}

function makeCrc32Table() {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }

  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(output: number[], value: number) {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(output: number[], value: number) {
  output.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function stringToBytes(value: string) {
  return new TextEncoder().encode(value);
}

type ZipInputFile = {
  path: string;
  data: Uint8Array;
};

function makeZipBlob(files: ZipInputFile[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = stringToBytes(file.path);
    const checksum = crc32(file.data);
    const localHeader: number[] = [];

    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0x0800);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint32(localHeader, checksum);
    writeUint32(localHeader, file.data.length);
    writeUint32(localHeader, file.data.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);

    const localPart = new Uint8Array(
      localHeader.length + nameBytes.length + file.data.length,
    );
    localPart.set(localHeader, 0);
    localPart.set(nameBytes, localHeader.length);
    localPart.set(file.data, localHeader.length + nameBytes.length);
    localParts.push(localPart);

    const centralHeader: number[] = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0x0800);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, checksum);
    writeUint32(centralHeader, file.data.length);
    writeUint32(centralHeader, file.data.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);

    const centralPart = new Uint8Array(centralHeader.length + nameBytes.length);
    centralPart.set(centralHeader, 0);
    centralPart.set(nameBytes, centralHeader.length);
    centralParts.push(centralPart);

    offset += localPart.length;
  });

  const centralDirectorySize = centralParts.reduce(
    (sum, part) => sum + part.length,
    0,
  );
  const endHeader: number[] = [];
  writeUint32(endHeader, 0x06054b50);
  writeUint16(endHeader, 0);
  writeUint16(endHeader, 0);
  writeUint16(endHeader, files.length);
  writeUint16(endHeader, files.length);
  writeUint32(endHeader, centralDirectorySize);
  writeUint32(endHeader, offset);
  writeUint16(endHeader, 0);

  const zipParts = [
    ...localParts,
    ...centralParts,
    new Uint8Array(endHeader),
  ];
  const totalLength = zipParts.reduce(
    (sum, part) => sum + part.byteLength,
    0,
  );
  const zipBytes = new Uint8Array(totalLength);

  let writeOffset = 0;
  zipParts.forEach((part) => {
    zipBytes.set(part, writeOffset);
    writeOffset += part.byteLength;
  });

  return new Blob([zipBytes.buffer], {
    type: "application/zip",
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function safeFilename(name: string) {
  return (
    (name || "pixel-collection")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "pixel-collection"
  );
}

export default function PixelEditorPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pngInputRef = useRef<HTMLInputElement | null>(null);
  const outputRef = useRef<HTMLCanvasElement | null>(null);
  const shareRef = useRef<HTMLCanvasElement | null>(null);

  const [theme, setTheme] = useState<Theme>("light");
  const [tab, setTab] = useState<Tab>("design");
  const [project, setProject] = useState<Project>(() => makeInitialProject());
  const [color, setColor] = useState("#000000");
  const [paletteInput, setPaletteInput] = useState("");
  const [paletteColors, setPaletteColors] = useState<string[]>([]);
  const [paletteStatus, setPaletteStatus] = useState("Paste hex colors or a Lospec palette URL.");
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [tool, setTool] = useState<Tool>("paint");
  const [showGrid, setShowGrid] = useState(true);
  const [activeLayerId, setActiveLayerId] = useState(project.layers[0].id);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [moveStart, setMoveStart] = useState<number | null>(null);
  const [clipboard, setClipboard] = useState<string[] | null>(null);
  const [areaClipboard, setAreaClipboard] = useState<ClipboardArea | null>(
    null,
  );
  const [historyPast, setHistoryPast] = useState<Project[]>([]);
  const [historyFuture, setHistoryFuture] = useState<Project[]>([]);
  const [status, setStatus] = useState("Ready");
  const [outputPixels, setOutputPixels] = useState<string[]>(() =>
    emptyPixels(project.gridSize),
  );
  const [generatedItems, setGeneratedItems] = useState<GeneratedItem[]>([]);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>(
    {},
  );
  const [selectedGeneratedId, setSelectedGeneratedId] = useState<number | null>(
    null,
  );
  const [shareItems, setShareItems] = useState<GeneratedItem[]>([]);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({
    grid: 4,
    frame: 8,
    outerMargin: 32,
    tokenScale: 92,
    background: "white",
    customBackground: "#ffffff",
    exportScale: 1,
  });

  const isDark = theme === "dark";

  const ui = {
    page: isDark ? "bg-black text-white" : "bg-white text-black",
    panel: isDark ? "bg-black border-white" : "bg-white border-black",
    soft: isDark ? "bg-zinc-900" : "bg-gray-100",
    input: isDark
      ? "bg-black text-white border-white"
      : "bg-white text-black border-black",
    active: isDark
      ? "bg-white text-black border-white"
      : "bg-black text-white border-black",
    inactive: isDark
      ? "bg-black text-white border-white"
      : "bg-white text-black border-black",
    border: isDark ? "border-white" : "border-black",
    mutedBorder: isDark ? "border-zinc-600" : "border-gray-400",
  };

  const activeLayer =
    project.layers.find((layer) => layer.id === activeLayerId) ??
    project.layers[0];
  const activeTrait =
    activeLayer.traits.find(
      (trait) => trait.id === activeLayer.activeTraitId,
    ) ?? activeLayer.traits[0];
  const traitCount = project.layers.reduce(
    (sum, layer) => sum + layer.traits.length,
    0,
  );
  const canvasCellSize = clampNumber(Math.floor(560 / project.gridSize), 5, 22);
  const ruleAnalysis = useMemo(() => analyzeRules(project), [project]);
  const possibleCombinations = ruleAnalysis.combinations;

  const usedColors = useMemo(() => {
    const colors = new Set<string>();

    project.layers.forEach((layer) => {
      layer.traits.forEach((trait) => {
        trait.pixels.forEach((pixel) => {
          if (pixel !== "transparent") colors.add(pixel);
        });
      });
    });

    return Array.from(colors);
  }, [project.layers]);

  const previewPixels = useMemo(() => {
    const pixels = emptyPixels(project.gridSize);

    project.layers.forEach((layer) => {
      if (!layer.visible) return;
      const trait = layer.traits.find(
        (item) => item.id === layer.activeTraitId,
      );
      if (!trait) return;

      trait.pixels.forEach((pixel, index) => {
        if (pixel === "transparent") return;
        pixels[index] =
          layer.onion && layer.id !== activeLayerId
            ? colorWithAlpha(pixel, 0.35)
            : pixel;
      });
    });

    return pixels;
  }, [project, activeLayerId]);

  const traitUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    generatedItems.forEach((item) => {
      Object.values(item.traitIds).forEach((traitId) => {
        const id = String(traitId);
        counts[id] = (counts[id] ?? 0) + 1;
      });
    });
    return counts;
  }, [generatedItems]);

  const filteredItems = useMemo(() => {
    return generatedItems.filter((item) => {
      return Object.entries(activeFilters as Record<string, string[]>).every(
        ([layerId, traitIds]) => {
          if (!traitIds.length) return true;
          return traitIds.includes(item.traitIds[layerId]);
        },
      );
    });
  }, [generatedItems, activeFilters]);

  const selectedItem =
    generatedItems.find((item) => item.id === selectedGeneratedId) ??
    generatedItems[0] ??
    null;

  function pushHistory(current: Project) {
    setHistoryPast((past) => [
      ...past.slice(Math.max(0, past.length - MAX_HISTORY + 1)),
      cloneProject(current),
    ]);
    setHistoryFuture([]);
  }

  function setProjectWithHistory(
    updater: (current: Project) => Project,
    message = "Unsaved changes",
  ) {
    setProject((current) => {
      pushHistory(current);
      const next = normalizeProject({
        ...updater(current),
        updatedAt: new Date().toISOString(),
      });
      setStatus(message);
      return next;
    });
  }

  function setProjectSoft(
    updater: (current: Project) => Project,
    message = "Updated",
  ) {
    setProject((current) => {
      const next = normalizeProject({
        ...updater(current),
        updatedAt: new Date().toISOString(),
      });
      setStatus(message);
      return next;
    });
  }

  function undo() {
    setHistoryPast((past) => {
      if (!past.length) return past;
      const previous = past[past.length - 1];
      setProject((current) => {
        setHistoryFuture((future) => [cloneProject(current), ...future]);
        return cloneProject(previous);
      });
      setSelection(null);
      setStatus("Undo");
      return past.slice(0, -1);
    });
  }

  function redo() {
    setHistoryFuture((future) => {
      if (!future.length) return future;
      const next = future[0];
      setProject((current) => {
        setHistoryPast((past) => [
          ...past.slice(Math.max(0, past.length - MAX_HISTORY + 1)),
          cloneProject(current),
        ]);
        return cloneProject(next);
      });
      setSelection(null);
      setStatus("Redo");
      return future.slice(1);
    });
  }

  function updateProjectField<K extends keyof Project>(
    key: K,
    value: Project[K],
  ) {
    setProjectSoft(
      (current) => ({ ...current, [key]: value }),
      "Project settings updated",
    );
  }

  function updateGridSize(value: number) {
    const newSize = clampNumber(value, 2, 128);
    const oldSize = project.gridSize;
    if (newSize === oldSize) return;

    setProjectWithHistory(
      (current) => ({
        ...current,
        gridSize: newSize,
        layers: current.layers.map((layer) => ({
          ...layer,
          traits: layer.traits.map((trait) => ({
            ...trait,
            pixels: resizePixels(trait.pixels, oldSize, newSize),
          })),
        })),
      }),
      `Grid resized to ${newSize}x${newSize}`,
    );

    setOutputPixels(emptyPixels(newSize));
    setGeneratedItems([]);
    setShareItems([]);
    setSelection(null);
  }

  function updateActiveLayer(
    updater: (layer: Layer) => Layer,
    message?: string,
  ) {
    setProjectWithHistory(
      (current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === activeLayer.id ? updater(layer) : layer,
        ),
      }),
      message,
    );
  }

  function updateActiveTrait(
    updater: (trait: Trait) => Trait,
    message?: string,
  ) {
    updateActiveLayer(
      (layer) => ({
        ...layer,
        traits: layer.traits.map((trait) =>
          trait.id === layer.activeTraitId ? updater(trait) : trait,
        ),
      }),
      message,
    );
  }

  function setActivePixels(pixels: string[]) {
    updateActiveTrait((trait) => ({ ...trait, pixels }), "Canvas updated");
  }

  function setPixel(index: number, newColor: string) {
    const pixels = [...activeTrait.pixels];
    pixels[index] = newColor;
    setActivePixels(pixels);
  }

  function floodFill(startIndex: number) {
    const pixels = [...activeTrait.pixels];
    const targetColor = pixels[startIndex];
    if (targetColor === color) return;

    const stack = [startIndex];
    while (stack.length) {
      const index = stack.pop()!;
      if (pixels[index] !== targetColor) continue;
      pixels[index] = color;

      const x = index % project.gridSize;
      const y = Math.floor(index / project.gridSize);
      if (x > 0) stack.push(index - 1);
      if (x < project.gridSize - 1) stack.push(index + 1);
      if (y > 0) stack.push(index - project.gridSize);
      if (y < project.gridSize - 1) stack.push(index + project.gridSize);
    }

    setActivePixels(pixels);
  }

  function applyTool(index: number) {
    if (tool === "paint") setPixel(index, color);
    if (tool === "erase") setPixel(index, "transparent");
    if (tool === "bucket") floodFill(index);
  }

  function handlePixelMouseDown(index: number) {
    if (tool === "select") {
      setSelection({ start: index, end: index });
      setIsSelecting(true);
      return;
    }

    if (tool === "move") {
      setMoveStart(index);
      return;
    }

    applyTool(index);
  }

  function handlePixelMouseEnter(index: number, buttons: number) {
    if (tool === "select" && isSelecting) {
      setSelection((current) =>
        current ? { ...current, end: index } : { start: index, end: index },
      );
      return;
    }

    if (buttons === 1 && tool !== "bucket" && tool !== "move") applyTool(index);
  }

  function handlePixelMouseUp(index: number) {
    if (tool === "select") {
      setSelection((current) =>
        current ? { ...current, end: index } : { start: index, end: index },
      );
      setIsSelecting(false);
      return;
    }

    if (tool !== "move" || moveStart === null) return;
    const startX = moveStart % project.gridSize;
    const startY = Math.floor(moveStart / project.gridSize);
    const endX = index % project.gridSize;
    const endY = Math.floor(index / project.gridSize);
    setActivePixels(
      movePixels(
        activeTrait.pixels,
        project.gridSize,
        endX - startX,
        endY - startY,
      ),
    );
    setMoveStart(null);
  }

  function addLayer() {
    const layer = makeLayer(
      `Layer ${project.layers.length + 1}`,
      project.gridSize,
    );
    setProjectWithHistory(
      (current) => ({ ...current, layers: [...current.layers, layer] }),
      "Layer added",
    );
    setActiveLayerId(layer.id);
  }

  function removeLayer(layerId: string) {
    if (project.layers.length <= 1) return;
    const nextLayers = project.layers.filter((layer) => layer.id !== layerId);
    setProjectWithHistory(
      (current) => ({
        ...current,
        layers: current.layers.filter((layer) => layer.id !== layerId),
      }),
      "Layer removed",
    );
    setActiveLayerId(nextLayers[0].id);
  }

  function moveLayer(layerId: string, direction: -1 | 1) {
    const index = project.layers.findIndex((layer) => layer.id === layerId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= project.layers.length)
      return;

    setProjectWithHistory((current) => {
      const layers = [...current.layers];
      const [layer] = layers.splice(index, 1);
      layers.splice(nextIndex, 0, layer);
      return { ...current, layers };
    }, "Layer order updated");
  }

  function addTrait(layerId: string) {
    const trait = makeTrait(
      project.layers.find((layer) => layer.id === layerId)?.traits.length ?? 0,
      project.gridSize,
    );
    setProjectWithHistory(
      (current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                open: true,
                activeTraitId: trait.id,
                traits: [...layer.traits, trait],
              }
            : layer,
        ),
      }),
      "Trait added",
    );
    setActiveLayerId(layerId);
    setSelection(null);
  }

  function duplicateTrait(layerId: string, traitId: string) {
    const layer = project.layers.find((item) => item.id === layerId);
    const trait = layer?.traits.find((item) => item.id === traitId);
    if (!layer || !trait) return;

    const duplicate: Trait = {
      ...trait,
      id: uid("trait"),
      name: `${trait.name} Copy`,
      pixels: [...trait.pixels],
      incompatibleWith: [...trait.incompatibleWith],
    };

    setProjectWithHistory(
      (current) => ({
        ...current,
        layers: current.layers.map((item) =>
          item.id === layerId
            ? {
                ...item,
                activeTraitId: duplicate.id,
                traits: [...item.traits, duplicate],
              }
            : item,
        ),
      }),
      "Trait duplicated",
    );
    setActiveLayerId(layerId);
  }

  function removeTrait(layerId: string, traitId: string) {
    const layer = project.layers.find((item) => item.id === layerId);
    if (!layer || layer.traits.length <= 1) return;

    setProjectWithHistory(
      (current) => ({
        ...current,
        layers: current.layers.map((item) => {
          if (item.id !== layerId) return item;
          const traits = item.traits.filter((trait) => trait.id !== traitId);
          return {
            ...item,
            traits: traits.map((trait) => ({
              ...trait,
              incompatibleWith: trait.incompatibleWith.filter(
                (id) => id !== traitId,
              ),
            })),
            activeTraitId:
              item.activeTraitId === traitId
                ? traits[0].id
                : item.activeTraitId,
          };
        }),
      }),
      "Trait removed",
    );
  }

  function selectTrait(layerId: string, traitId: string) {
    setActiveLayerId(layerId);
    setSelection(null);
    setProjectSoft(
      (current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === layerId ? { ...layer, activeTraitId: traitId } : layer,
        ),
      }),
      "Trait selected",
    );
  }

  function setTraitRarity(layerId: string, traitId: string, rarity: RarityKey) {
    const weight =
      rarityOptions.find((item) => item.key === rarity)?.weight ?? 100;
    setProjectWithHistory(
      (current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                traits: layer.traits.map((trait) =>
                  trait.id === traitId ? { ...trait, rarity, weight } : trait,
                ),
              }
            : layer,
        ),
      }),
      "Rarity updated",
    );
  }

  function toggleIncompatibility(targetTraitId: string) {
    updateActiveTrait((trait) => {
      const exists = trait.incompatibleWith.includes(targetTraitId);
      return {
        ...trait,
        incompatibleWith: exists
          ? trait.incompatibleWith.filter((id) => id !== targetTraitId)
          : [...trait.incompatibleWith, targetTraitId],
      };
    }, "Cannot appear with updated");
  }

  function setLayerIncompatibility(targetLayerId: string, enabled: boolean) {
    const targetIds =
      project.layers
        .find((layer) => layer.id === targetLayerId)
        ?.traits.map((trait) => trait.id)
        .filter((traitId) => traitId !== activeTrait.id) ?? [];

    updateActiveTrait(
      (trait) => {
        const existing = new Set(trait.incompatibleWith);
        targetIds.forEach((traitId) => {
          if (enabled) existing.add(traitId);
          else existing.delete(traitId);
        });
        return { ...trait, incompatibleWith: Array.from(existing) };
      },
      enabled ? "Layer blocked" : "Layer unblocked",
    );
  }

  function isLayerFullyBlocked(layer: Layer) {
    const targetIds = layer.traits
      .map((trait) => trait.id)
      .filter((traitId) => traitId !== activeTrait.id);
    return (
      targetIds.length > 0 &&
      targetIds.every((traitId) =>
        activeTrait.incompatibleWith.includes(traitId),
      )
    );
  }

  function clearCanvas() {
    setActivePixels(emptyPixels(project.gridSize));
    setSelection(null);
  }

  function copyPixels() {
    setClipboard([...activeTrait.pixels]);
    setStatus("Copied active trait");
  }

  function pastePixels() {
    if (!clipboard) return;
    setActivePixels(
      resizePixels(
        clipboard,
        Math.round(Math.sqrt(clipboard.length)),
        project.gridSize,
      ),
    );
  }

  function copySelection() {
    const bounds = boundsFromSelection(selection, project.gridSize);
    if (!bounds) {
      setStatus("Select an area first");
      return;
    }

    const width = bounds.x2 - bounds.x1 + 1;
    const height = bounds.y2 - bounds.y1 + 1;
    const pixels: string[] = [];

    for (let y = bounds.y1; y <= bounds.y2; y++) {
      for (let x = bounds.x1; x <= bounds.x2; x++) {
        pixels.push(activeTrait.pixels[y * project.gridSize + x]);
      }
    }

    setAreaClipboard({ width, height, pixels });
    setStatus("Copied selection");
  }

  function cutSelection() {
    const bounds = boundsFromSelection(selection, project.gridSize);
    if (!bounds) {
      setStatus("Select an area first");
      return;
    }

    copySelection();
    const pixels = [...activeTrait.pixels];
    for (let y = bounds.y1; y <= bounds.y2; y++) {
      for (let x = bounds.x1; x <= bounds.x2; x++) {
        pixels[y * project.gridSize + x] = "transparent";
      }
    }
    setActivePixels(pixels);
  }

  function pasteSelection() {
    if (!areaClipboard) {
      setStatus("Copy an area first");
      return;
    }

    const bounds = boundsFromSelection(selection, project.gridSize);
    const startX = bounds ? bounds.x1 : 0;
    const startY = bounds ? bounds.y1 : 0;
    const pixels = [...activeTrait.pixels];

    for (let y = 0; y < areaClipboard.height; y++) {
      for (let x = 0; x < areaClipboard.width; x++) {
        const targetX = startX + x;
        const targetY = startY + y;
        if (
          targetX < 0 ||
          targetX >= project.gridSize ||
          targetY < 0 ||
          targetY >= project.gridSize
        )
          continue;
        pixels[targetY * project.gridSize + targetX] =
          areaClipboard.pixels[y * areaClipboard.width + x];
      }
    }

    setActivePixels(pixels);
  }

  function clearSelection() {
    const bounds = boundsFromSelection(selection, project.gridSize);
    if (!bounds) return;

    const pixels = [...activeTrait.pixels];
    for (let y = bounds.y1; y <= bounds.y2; y++) {
      for (let x = bounds.x1; x <= bounds.x2; x++) {
        pixels[y * project.gridSize + x] = "transparent";
      }
    }
    setActivePixels(pixels);
  }

  function moveSelection(dx: number, dy: number) {
    const bounds = boundsFromSelection(selection, project.gridSize);
    if (!bounds) {
      setActivePixels(movePixels(activeTrait.pixels, project.gridSize, dx, dy));
      return;
    }

    const pixels = [...activeTrait.pixels];
    const selectedPixels: { x: number; y: number; color: string }[] = [];

    for (let y = bounds.y1; y <= bounds.y2; y++) {
      for (let x = bounds.x1; x <= bounds.x2; x++) {
        selectedPixels.push({ x, y, color: pixels[y * project.gridSize + x] });
        pixels[y * project.gridSize + x] = "transparent";
      }
    }

    selectedPixels.forEach((item) => {
      const nx = item.x + dx;
      const ny = item.y + dy;
      if (nx < 0 || nx >= project.gridSize || ny < 0 || ny >= project.gridSize)
        return;
      pixels[ny * project.gridSize + nx] = item.color;
    });

    setActivePixels(pixels);
  }

  function randomizeOutput() {
    if (ruleAnalysis.errors.length) {
      setStatus("Fix validation errors before generating.");
      return;
    }
    const item = generateOneItem(project, 1);
    if (!item) {
      setStatus("No valid output. Check rules.");
      return;
    }

    setOutputPixels(item.pixels);
    if (outputRef.current)
      drawPixelsToCanvas(
        outputRef.current,
        item.pixels,
        project.gridSize,
        1,
        "transparent",
      );
    setStatus("Random output generated");
  }

  function downloadOutput(scale: number) {
    const canvas = document.createElement("canvas");
    drawPixelsToCanvas(
      canvas,
      outputPixels,
      project.gridSize,
      scale,
      "transparent",
    );
    downloadCanvas(
      canvas,
      `${safeFilename(project.name)}-single-${scale}x.png`,
    );
  }

  function generateCollection() {
    if (ruleAnalysis.errors.length) {
      setStatus("Fix rule validation errors before generating a collection.");
      setTab("design");
      return;
    }
    const targetSupply = clampNumber(project.supply, 1, 10000);
    const maxAttempts = targetSupply * MAX_GENERATE_ATTEMPTS_MULTIPLIER;
    const items: GeneratedItem[] = [];
    const seen = new Set<string>();
    let attempts = 0;

    while (items.length < targetSupply && attempts < maxAttempts) {
      attempts++;
      const item = generateOneItem(project, items.length + 1);
      if (!item) {
        setStatus("Unable to generate a valid combination. Check trait rules.");
        break;
      }
      if (seen.has(item.comboKey)) continue;
      seen.add(item.comboKey);
      items.push(item);
    }

    setGeneratedItems(items);
    setShareItems(items.slice(0, shareSettings.grid * shareSettings.grid));
    setActiveFilters({});
    setSelectedGeneratedId(items[0]?.id ?? null);
    setTab("collection");
    setStatus(
      items.length === targetSupply
        ? `Generated ${items.length} rule-valid unique items`
        : `Generated ${items.length}/${targetSupply} unique items. The valid combination pool or attempt limit may be too small.`,
    );
  }

  function shuffleCollection() {
    setGeneratedItems((current) => {
      const next = [...current];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      setShareItems(next.slice(0, shareSettings.grid * shareSettings.grid));
      return next;
    });
    setStatus("Collection shuffled");
  }

  function refreshShareItems() {
    const needed = shareSettings.grid * shareSettings.grid;
    setShareItems(filteredItems.slice(0, needed));
    setStatus(
      `Share grid filled with ${Math.min(filteredItems.length, needed)} items`,
    );
    requestAnimationFrame(() => drawShareGrid());
  }

  function drawShareGrid(download = false) {
    const canvas = download
      ? document.createElement("canvas")
      : shareRef.current;
    if (!canvas) return null;

    const grid = clampNumber(shareSettings.grid, 2, 10);
    const baseCell = project.gridSize * 12;
    const frame = shareSettings.frame;
    const margin = shareSettings.outerMargin;
    const exportScale = download ? shareSettings.exportScale : 1;
    const cellSize = baseCell;
    const finalSize =
      (grid * cellSize + margin * 2 + frame * Math.max(0, grid - 1)) *
      exportScale;

    canvas.width = finalSize;
    canvas.height = finalSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, finalSize, finalSize);

    const bg =
      shareSettings.background === "custom"
        ? shareSettings.customBackground
        : shareSettings.background;
    if (bg !== "transparent") {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, finalSize, finalSize);
    }

    const items = shareItems.length
      ? shareItems
      : filteredItems.slice(0, grid * grid);
    const scaledCell = cellSize * exportScale;
    const scaledMargin = margin * exportScale;
    const scaledFrame = frame * exportScale;
    const artScale = clampNumber(shareSettings.tokenScale, 50, 100) / 100;

    items.slice(0, grid * grid).forEach((item, index) => {
      const col = index % grid;
      const row = Math.floor(index / grid);
      const cellX = scaledMargin + col * (scaledCell + scaledFrame);
      const cellY = scaledMargin + row * (scaledCell + scaledFrame);
      const artSize = Math.floor(scaledCell * artScale);
      const artX = cellX + Math.floor((scaledCell - artSize) / 2);
      const artY = cellY + Math.floor((scaledCell - artSize) / 2);
      drawItemIntoRect(
        ctx,
        item,
        project.gridSize,
        artX,
        artY,
        artSize,
        artSize,
      );
    });

    return canvas;
  }

  function downloadShareGrid() {
    const canvas = drawShareGrid(true);
    if (!canvas) return;
    downloadCanvas(
      canvas,
      `${safeFilename(project.name)}-share-${shareSettings.grid}x${shareSettings.grid}.png`,
    );
  }

  function exportProjectJson() {
    const json = JSON.stringify(
      { ...project, updatedAt: new Date().toISOString() },
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json" });
    const link = document.createElement("a");
    link.download = `${safeFilename(project.name)}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportMetadataJson() {
    if (!generatedItems.length) {
      setStatus("Generate the collection first");
      return;
    }

    const metadata = generatedItems.map((item) => ({
      id: item.id,
      name: `${project.name} #${item.id}`,
      attributes: project.layers
        .map((layer) => {
          const trait = layer.traits.find(
            (itemTrait) => itemTrait.id === item.traitIds[layer.id],
          );
          if (!trait) return null;
          return { trait_type: layer.name, value: trait.name };
        })
        .filter(Boolean),
    }));

    const blob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.download = `${safeFilename(project.name)}-metadata.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function exportTraitPngs() {
    const totalTraits = project.layers.reduce(
      (sum, layer) => sum + layer.traits.length,
      0,
    );

    if (!totalTraits) {
      setStatus("No traits to export");
      return;
    }

    function uniquePngName(baseName: string, usedNames: Set<string>) {
      const cleanBase = safeFilename(baseName || "trait");
      let name = `${cleanBase}.png`;
      let index = 2;

      while (usedNames.has(name)) {
        name = `${cleanBase}-${index}.png`;
        index++;
      }

      usedNames.add(name);
      return name;
    }

    setStatus("Preparing trait ZIP...");

    const files: ZipInputFile[] = [];
    const rootFolder = `${safeFilename(project.name)}/traits`;
    const usedLayerNames = new Set<string>();
    let failed = 0;

    for (const layer of project.layers) {
      let layerFolderName = safeFilename(layer.name || "layer");
      const originalLayerFolderName = layerFolderName;
      let layerNameIndex = 2;

      while (usedLayerNames.has(layerFolderName)) {
        layerFolderName = `${originalLayerFolderName}-${layerNameIndex}`;
        layerNameIndex++;
      }

      usedLayerNames.add(layerFolderName);
      const usedTraitNames = new Set<string>();

      for (const trait of layer.traits) {
        try {
          const canvas = document.createElement("canvas");
          drawTraitToCanvas(canvas, trait, project.gridSize);
          const blob = await canvasToPngBlob(canvas);

          if (!blob) {
            failed++;
            continue;
          }

          const fileName = uniquePngName(trait.name, usedTraitNames);
          const data = new Uint8Array(await blob.arrayBuffer());

          files.push({
            path: `${rootFolder}/${layerFolderName}/${fileName}`,
            data,
          });
        } catch {
          failed++;
        }
      }
    }

    if (!files.length) {
      setStatus("Trait ZIP export failed");
      return;
    }

    const zipBlob = makeZipBlob(files);
    downloadBlob(zipBlob, `${safeFilename(project.name)}-traits.zip`);
    setStatus(
      failed
        ? `Exported ${files.length}/${totalTraits} trait PNGs as ZIP. ${failed} failed.`
        : `Exported ${files.length} trait PNGs as ZIP`,
    );
  }

  function exportFullCollectionPng() {
    if (!generatedItems.length) {
      setStatus("Generate the collection first");
      return;
    }

    const columns = Math.ceil(Math.sqrt(generatedItems.length));
    const rows = Math.ceil(generatedItems.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = columns * project.gridSize;
    canvas.height = rows * project.gridSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    generatedItems.forEach((item, index) => {
      const xOffset = (index % columns) * project.gridSize;
      const yOffset = Math.floor(index / columns) * project.gridSize;
      item.pixels.forEach((pixel, pixelIndex) => {
        if (pixel === "transparent") return;
        const x = pixelIndex % project.gridSize;
        const y = Math.floor(pixelIndex / project.gridSize);
        ctx.fillStyle = pixel;
        ctx.fillRect(xOffset + x, yOffset + y, 1, 1);
      });
    });

    downloadCanvas(canvas, `${safeFilename(project.name)}-spritesheet.png`);
  }

  async function loadPaletteHelper() {
    const input = paletteInput.trim();
    if (!input) {
      setPaletteStatus("Paste a Lospec palette URL or a list of hex colors first.");
      return;
    }
    const slug = lospecPaletteSlug(input);
    if (slug) {
      setPaletteLoading(true);
      try {
        const response = await fetch(`https://lospec.com/palette-list/${slug}.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: unknown = await response.json();
        const raw = (data && typeof data === "object" && "colors" in data) ? (data as {colors: unknown}).colors : [];
        const parsed = Array.isArray(raw) ? parsePaletteColors(raw.join(" ")) : [];
        if (!parsed.length) throw new Error("No colors returned");
        setPaletteColors(parsed);
        setPaletteStatus(`Loaded ${parsed.length} colors from Lospec. Click a swatch to select a paint color.`);
      } catch {
        setPaletteColors([]);
        setPaletteStatus("Couldn't load this Lospec link directly (the browser may block cross-origin requests). Copy the hex color list from Lospec and paste it here instead.");
      } finally { setPaletteLoading(false); }
      return;
    }
    if (/^https?:\/\//i.test(input)) {
      setPaletteStatus("Use a Lospec palette-list URL, or paste hex colors directly.");
      return;
    }
    const parsed = parsePaletteColors(input);
    setPaletteColors(parsed);
    setPaletteStatus(parsed.length ? `Ready: ${parsed.length} colors. Click a swatch to select it.` : "No valid hex colors found. Example: #000000 #ffffff #ff004d");
  }

  function saveLocal() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(project));
    setStatus("Saved locally in browser");
  }

  function loadLocal() {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) {
      setStatus("No local project found");
      return;
    }

    try {
      const loaded = normalizeProject(JSON.parse(saved));
      setProject(loaded);
      setActiveLayerId(loaded.layers[0].id);
      setOutputPixels(emptyPixels(loaded.gridSize));
      setGeneratedItems([]);
      setShareItems([]);
      setHistoryPast([]);
      setHistoryFuture([]);
      setStatus("Loaded local project");
    } catch {
      setStatus("Local project could not be loaded");
    }
  }

  function importProject(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const loaded = normalizeProject(JSON.parse(String(reader.result)));
        setProject(loaded);
        setActiveLayerId(loaded.layers[0].id);
        setOutputPixels(emptyPixels(loaded.gridSize));
        setGeneratedItems([]);
        setShareItems([]);
        setHistoryPast([]);
        setHistoryFuture([]);
        setStatus("Imported project JSON");
      } catch {
        setStatus("Import failed");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function uploadPng(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      const temp = document.createElement("canvas");
      temp.width = project.gridSize;
      temp.height = project.gridSize;

      const ctx = temp.getContext("2d");
      if (!ctx) return;

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, project.gridSize, project.gridSize);

      const data = ctx.getImageData(
        0,
        0,
        project.gridSize,
        project.gridSize,
      ).data;
      const pixels = emptyPixels(project.gridSize);

      for (let i = 0; i < project.gridSize * project.gridSize; i++) {
        pixels[i] = normalizeColor(
          data[i * 4],
          data[i * 4 + 1],
          data[i * 4 + 2],
          data[i * 4 + 3],
        );
      }

      setActivePixels(pixels);
      URL.revokeObjectURL(img.src);
    };

    event.target.value = "";
  }

  function toggleFilter(layerId: string, traitId: string) {
    setActiveFilters((current) => {
      const existing = current[layerId] ?? [];
      const next = existing.includes(traitId)
        ? existing.filter((id) => id !== traitId)
        : [...existing, traitId];
      return { ...current, [layerId]: next };
    });
  }

  function shareBackgroundLabel() {
    if (shareSettings.background === "custom")
      return shareSettings.customBackground;
    return shareSettings.background;
  }

  React.useEffect(() => {
    if (outputRef.current)
      drawPixelsToCanvas(
        outputRef.current,
        outputPixels,
        project.gridSize,
        1,
        "transparent",
      );
  }, [outputPixels, project.gridSize]);

  React.useEffect(() => {
    if (tab === "share") requestAnimationFrame(() => drawShareGrid());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, shareItems, shareSettings, filteredItems, project.gridSize]);

  React.useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return (
        ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) ||
        element.isContentEditable
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;

      if (meta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection) {
          event.preventDefault();
          clearSelection();
        }
        return;
      }

      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        if (event.key === "ArrowUp") moveSelection(0, -1);
        if (event.key === "ArrowDown") moveSelection(0, 1);
        if (event.key === "ArrowLeft") moveSelection(-1, 0);
        if (event.key === "ArrowRight") moveSelection(1, 0);
        return;
      }

      const shortcuts: Record<string, Tool> = {
        p: "paint",
        e: "erase",
        b: "bucket",
        m: "move",
        s: "select",
      };
      if (shortcuts[key]) {
        event.preventDefault();
        setTool(shortcuts[key]);
        setStatus(`${shortcuts[key]} tool selected`);
        return;
      }

      if (key === "g") {
        event.preventDefault();
        setShowGrid((current) => !current);
        setStatus("Grid toggled");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const toolButtons: {
    tool: Tool;
    label: string;
    icon: string;
    shortcut: string;
  }[] = [
    { tool: "paint", label: "Paint", icon: "✎", shortcut: "P" },
    { tool: "erase", label: "Erase", icon: "⌫", shortcut: "E" },
    { tool: "bucket", label: "Bucket", icon: "◫", shortcut: "B" },
    { tool: "move", label: "Move", icon: "↕", shortcut: "M" },
    { tool: "select", label: "Select", icon: "▣", shortcut: "S" },
  ];

  return (
    <>

    <main className={`mintbay-editor min-h-screen p-4 font-mono text-sm ${ui.page}`}>
      <div className={`mb-4 border-2 p-3 ${ui.panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold uppercase">
              PIXEL STUDIO / NFT CREATOR
            </h1>
            <p className="uppercase">{status}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["design", "collection", "share", "onchain"] as Tab[]).map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`border-2 px-4 py-2 uppercase ${tab === item ? ui.active : ui.inactive}`}
              >
                {item}
              </button>
            ))}
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={`border-2 px-4 py-2 uppercase ${ui.inactive}`}
            >
              {isDark ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </div>

      {tab === "onchain" && (
        <OnchainExportPanel project={project} isDark={isDark} />
      )}

      {tab === "design" && (
        <div className="grid grid-cols-[330px_minmax(0,1fr)_310px] items-start gap-4 max-xl:grid-cols-1">
          <aside className={`border-2 p-3 ${ui.panel}`}>
            <div className={`mb-4 border-b-2 pb-3 ${ui.border}`}>
              <h2 className="mb-3 font-bold uppercase">Project</h2>
              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1 block uppercase">Name</span>
                  <input
                    value={project.name}
                    onChange={(event) =>
                      updateProjectField("name", event.target.value)
                    }
                    className={`w-full border-2 px-3 py-2 font-bold ${ui.input}`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block uppercase">Grid Size</span>
                  <input
                    type="number"
                    min={2}
                    max={128}
                    value={project.gridSize}
                    onChange={(event) =>
                      updateGridSize(Number(event.target.value))
                    }
                    className={`w-full border-2 px-3 py-2 ${ui.input}`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block uppercase">Supply</span>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={project.supply}
                    onChange={(event) =>
                      updateProjectField(
                        "supply",
                        clampNumber(Number(event.target.value), 1, 10000),
                      )
                    }
                    className={`w-full border-2 px-3 py-2 ${ui.input}`}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={saveLocal}
                    className={`border-2 px-3 py-2 uppercase ${ui.inactive}`}
                  >
                    Save Local
                  </button>
                  <button
                    onClick={loadLocal}
                    className={`border-2 px-3 py-2 uppercase ${ui.inactive}`}
                  >
                    Load Local
                  </button>
                  <button
                    onClick={exportProjectJson}
                    className={`border-2 px-3 py-2 uppercase ${ui.inactive}`}
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 px-3 py-2 uppercase ${ui.inactive}`}
                  >
                    Import JSON
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={importProject}
                  className="hidden"
                />
              </div>
              <div className={`mt-4 border-t-2 pt-3 ${ui.border}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">Palette helper</h3>
                  <a href={LOSPEC_LIST} target="_blank" rel="noopener noreferrer" className="underline">Browse Lospec ↗</a>
                </div>
                <textarea
                  value={paletteInput}
                  onChange={(event) => setPaletteInput(event.target.value)}
                  placeholder={"https://lospec.com/palette-list/sweetie-16"}
                  rows={3}
                  className={`w-full resize-y border-2 p-2 ${ui.input}`}
                />
                <button type="button" onClick={loadPaletteHelper} disabled={paletteLoading} className={`mt-2 w-full border-2 px-3 py-2 disabled:opacity-40 ${ui.inactive}`}>
                  {paletteLoading ? "Loading palette..." : "Load / preview palette"}
                </button>
                <p role="status" className="my-2 opacity-75">{paletteStatus}</p>
                {paletteColors.length > 0 && (
                  <div className="grid grid-cols-6 gap-2">
                    {paletteColors.map((swatch) => (
                      <button
                        type="button"
                        key={swatch}
                        title={`Select ${swatch}`}
                        aria-label={`Select paint color ${swatch}`}
                        onClick={() => { setColor(swatch); setStatus(`Selected palette color ${swatch}`); }}
                        className={`aspect-square border-2 ${color.toLowerCase() === swatch ? "ring-2 ring-offset-2 ring-current" : ""} ${ui.border}`}
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              className={`mb-3 flex items-center justify-between border-b-2 pb-2 ${ui.border}`}
            >
              <h2 className="font-bold uppercase">Layers</h2>
              <button
                onClick={addLayer}
                className={`border-2 px-3 py-1 uppercase ${ui.active}`}
              >
                + Layer
              </button>
            </div>

            <div className="space-y-3">
              {project.layers.map((layer, layerIndex) => (
                <div key={layer.id} className={`border-2 ${ui.border}`}>
                  <div
                    className={`flex items-center justify-between gap-2 border-b-2 p-2 ${ui.soft} ${ui.border}`}
                  >
                    <button
                      onClick={() =>
                        setProjectSoft(
                          (current) => ({
                            ...current,
                            layers: current.layers.map((item) =>
                              item.id === layer.id
                                ? { ...item, open: !item.open }
                                : item,
                            ),
                          }),
                          "Layer toggled",
                        )
                      }
                      className="font-bold uppercase"
                    >
                      {layer.open ? "-" : "+"}
                    </button>
                    <input
                      value={layer.name}
                      onChange={(event) =>
                        setProjectWithHistory(
                          (current) => ({
                            ...current,
                            layers: current.layers.map((item) =>
                              item.id === layer.id
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          }),
                          "Layer renamed",
                        )
                      }
                      className={`min-w-0 flex-1 border px-2 py-1 font-bold ${ui.input}`}
                    />
                    <button
                      onClick={() => moveLayer(layer.id, -1)}
                      disabled={layerIndex === 0}
                      className={`border px-2 disabled:opacity-30 ${ui.input}`}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveLayer(layer.id, 1)}
                      disabled={layerIndex === project.layers.length - 1}
                      className={`border px-2 disabled:opacity-30 ${ui.input}`}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() =>
                        setProjectSoft(
                          (current) => ({
                            ...current,
                            layers: current.layers.map((item) =>
                              item.id === layer.id
                                ? { ...item, visible: !item.visible }
                                : item,
                            ),
                          }),
                          "Layer visibility updated",
                        )
                      }
                      className={`border px-2 ${layer.visible ? ui.active : ui.input}`}
                    >
                      ◉
                    </button>
                    <button
                      onClick={() =>
                        setProjectSoft(
                          (current) => ({
                            ...current,
                            layers: current.layers.map((item) =>
                              item.id === layer.id
                                ? { ...item, onion: !item.onion }
                                : item,
                            ),
                          }),
                          "Onion updated",
                        )
                      }
                      className={`border px-2 ${layer.onion ? ui.active : ui.input}`}
                    >
                      Ghost
                    </button>
                    <button
                      onClick={() => removeLayer(layer.id)}
                      disabled={project.layers.length <= 1}
                      className={`border px-2 disabled:opacity-30 ${ui.input}`}
                    >
                      ×
                    </button>
                  </div>

                  {layer.open && (
                    <div className="space-y-2 p-2">
                      <button
                        onClick={() => addTrait(layer.id)}
                        className={`w-full border-2 px-3 py-2 uppercase ${ui.inactive}`}
                      >
                        + Trait
                      </button>

                      {layer.traits.map((trait) => (
                        <div
                          key={trait.id}
                          className={`border-2 p-2 ${activeLayerId === layer.id && layer.activeTraitId === trait.id ? ui.active : `${ui.inactive} ${ui.mutedBorder}`}`}
                        >
                          <button
                            onClick={() => selectTrait(layer.id, trait.id)}
                            className="mb-2 w-full text-left font-bold uppercase"
                          >
                            Edit Trait
                          </button>
                          <input
                            value={trait.name}
                            onChange={(event) =>
                              setProjectWithHistory(
                                (current) => ({
                                  ...current,
                                  layers: current.layers.map((item) =>
                                    item.id === layer.id
                                      ? {
                                          ...item,
                                          traits: item.traits.map((t) =>
                                            t.id === trait.id
                                              ? {
                                                  ...t,
                                                  name: event.target.value,
                                                }
                                              : t,
                                          ),
                                        }
                                      : item,
                                  ),
                                }),
                                "Trait renamed",
                              )
                            }
                            className={`mb-2 w-full border px-2 py-1 ${ui.input}`}
                          />
                          <div className="grid grid-cols-5 gap-1">
                            {rarityOptions.map((rarity) => (
                              <button
                                key={rarity.key}
                                title={rarity.label}
                                onClick={() =>
                                  setTraitRarity(layer.id, trait.id, rarity.key)
                                }
                                className={`border px-1 py-1 ${trait.rarity === rarity.key ? ui.active : ui.input}`}
                              >
                                {rarity.short}
                              </button>
                            ))}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button
                              onClick={() => duplicateTrait(layer.id, trait.id)}
                              className={`border px-2 py-1 uppercase ${ui.input}`}
                            >
                              Duplicate
                            </button>
                            <button
                              onClick={() => removeTrait(layer.id, trait.id)}
                              disabled={layer.traits.length <= 1}
                              className={`border px-2 py-1 uppercase disabled:opacity-30 ${ui.input}`}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>

          <section className={`min-w-0 border-2 p-3 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto xl:overscroll-contain ${ui.panel}`}>
            <div
              className={`mb-4 flex flex-wrap items-center justify-between gap-2 border-b-2 pb-3 ${ui.border}`}
            >
              <div>
                <h2 className="font-bold uppercase">Canvas</h2>
                <p>
                  {activeLayer.name} / {activeTrait.name}
                </p>
                <p className="mt-1 opacity-70">
                  Shortcuts: P Paint · E Erase · B Bucket · M Move · S Select ·
                  G Grid
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={undo}
                  disabled={!historyPast.length}
                  className={`border-2 px-3 py-2 uppercase disabled:opacity-30 ${ui.inactive}`}
                >
                  Undo
                </button>
                <button
                  onClick={redo}
                  disabled={!historyFuture.length}
                  className={`border-2 px-3 py-2 uppercase disabled:opacity-30 ${ui.inactive}`}
                >
                  Redo
                </button>
                <button
                  onClick={() => setShowGrid((prev) => !prev)}
                  className={`border-2 px-3 py-2 uppercase ${showGrid ? ui.active : ui.inactive}`}
                >
                  Grid
                </button>
              </div>
            </div>

            <div className="flex justify-center overflow-auto">
              <div
                className="grid touch-none"
                onMouseLeave={() => setIsSelecting(false)}
                style={{
                  gridTemplateColumns: `repeat(${project.gridSize}, ${canvasCellSize}px)`,
                  border: isDark ? "2px solid white" : "2px solid black",
                  cursor:
                    tool === "move"
                      ? "grab"
                      : tool === "select"
                        ? "cell"
                        : "crosshair",
                }}
              >
                {previewPixels.map((pixel, index) => (
                  <button
                    key={index}
                    onMouseDown={() => handlePixelMouseDown(index)}
                    onMouseUp={() => handlePixelMouseUp(index)}
                    onMouseEnter={(event) =>
                      handlePixelMouseEnter(index, event.buttons)
                    }
                    style={{
                      width: canvasCellSize,
                      height: canvasCellSize,
                      background:
                        pixel === "transparent"
                          ? isDark
                            ? "repeating-conic-gradient(#000 0% 25%, #333 0% 50%) 50% / 8px 8px"
                            : "repeating-conic-gradient(#fff 0% 25%, #ddd 0% 50%) 50% / 8px 8px"
                          : pixel,
                      border: isIndexSelected(
                        index,
                        selection,
                        project.gridSize,
                      )
                        ? "2px solid red"
                        : showGrid
                          ? isDark
                            ? "1px solid #555"
                            : "1px solid #bbb"
                          : "0",
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className={`h-10 w-12 border-2 ${ui.input}`}
              />
              {toolButtons.map((item) => (
                <button
                  key={item.tool}
                  onClick={() => setTool(item.tool)}
                  title={`${item.label} (${item.shortcut})`}
                  className={`relative border-2 px-3 py-2 text-base ${tool === item.tool ? ui.active : ui.inactive}`}
                >
                  <span aria-hidden="true">{item.icon}</span>
                </button>
              ))}
              <button
                onClick={copyPixels}
                className={`border-2 px-3 py-2 ${ui.inactive}`}
                title="Copy full"
              >
                Copy
              </button>
              <button
                onClick={pastePixels}
                disabled={!clipboard}
                className={`border-2 px-3 py-2 disabled:opacity-30 ${ui.inactive}`}
                title="Paste full"
              >
                Paste
              </button>
              <button
                onClick={clearCanvas}
                className={`border-2 px-3 py-2 ${ui.inactive}`}
                title="Clear"
              >
                Clear
              </button>
              <button
                onClick={() => pngInputRef.current?.click()}
                className={`border-2 px-3 py-2 ${ui.inactive}`}
                title="Upload PNG"
              >
                Upload
              </button>
              <input
                ref={pngInputRef}
                type="file"
                accept="image/png"
                onChange={uploadPng}
                className="hidden"
              />
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                onClick={copySelection}
                className={`border px-3 py-1 uppercase ${ui.input}`}
              >
                Copy Area
              </button>
              <button
                onClick={cutSelection}
                className={`border px-3 py-1 uppercase ${ui.input}`}
              >
                Cut Area
              </button>
              <button
                onClick={pasteSelection}
                disabled={!areaClipboard}
                className={`border px-3 py-1 uppercase disabled:opacity-30 ${ui.input}`}
              >
                Paste Area
              </button>
              <button
                onClick={clearSelection}
                className={`border px-3 py-1 uppercase ${ui.input}`}
              >
                Clear Area
              </button>
              <button
                onClick={() => setSelection(null)}
                className={`border px-3 py-1 uppercase ${ui.input}`}
              >
                Deselect
              </button>
              <button
                onClick={() => moveSelection(0, -1)}
                className={`border px-3 py-1 ${ui.input}`}
              >
                Up
              </button>
              <button
                onClick={() => moveSelection(0, 1)}
                className={`border px-3 py-1 ${ui.input}`}
              >
                Down
              </button>
              <button
                onClick={() => moveSelection(-1, 0)}
                className={`border px-3 py-1 ${ui.input}`}
              >
                Left
              </button>
              <button
                onClick={() => moveSelection(1, 0)}
                className={`border px-3 py-1 ${ui.input}`}
              >
                Right
              </button>
            </div>

            <div className={`mt-4 border-t-2 pt-3 ${ui.border}`}>
              <h3 className="mb-2 font-bold uppercase">Used Colors</h3>
              <div className="flex flex-wrap gap-2">
                {usedColors.length === 0 && <span>No colors yet.</span>}
                {usedColors.map((usedColor) => (
                  <button
                    key={usedColor}
                    title={usedColor}
                    onClick={() => setColor(usedColor)}
                    className={`h-7 w-7 border-2 ${ui.border}`}
                    style={{ background: usedColor }}
                  />
                ))}
              </div>
            </div>
          </section>

          <aside className={`border-2 p-3 ${ui.panel}`}>
            <div className={`mb-4 border-b-2 pb-3 ${ui.border}`}>
              <h2 className="font-bold">Rule validation</h2>
              <p className="mt-1">{ruleAnalysis.rules} incompatibilities · {ruleAnalysis.capped ? "At least " : ""}{ruleAnalysis.combinations.toLocaleString()} valid combinations</p>
              {ruleAnalysis.errors.length === 0 && <p className="mt-2">No rule errors found.</p>}
              {ruleAnalysis.errors.map((issue, index) => <p key={`error-${index}`} className="mt-2 border-l-4 border-red-500 pl-2">Error: {issue}</p>)}
              {ruleAnalysis.warnings.map((issue, index) => <p key={`warning-${index}`} className="mt-2 border-l-4 border-amber-500 pl-2">Warning: {issue}</p>)}
              <p className="mt-2 opacity-70">Studio generation enforces rules. On-chain renderer parity must still be tested before deployment.</p>
            </div>
            <div className={`mb-4 border-b-2 pb-3 ${ui.border}`}>
              <h2 className="font-bold uppercase">Trait Rules</h2>
              <p className="mt-1">
                {activeTrait.name} cannot appear with selected traits.
              </p>
            </div>

            <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
              {project.layers.map((layer) => {
                const layerTraits = layer.traits.filter(
                  (trait) => trait.id !== activeTrait.id,
                );
                if (!layerTraits.length) return null;
                const blockedCount = layerTraits.filter((trait) =>
                  activeTrait.incompatibleWith.includes(trait.id),
                ).length;
                const fullyBlocked = isLayerFullyBlocked(layer);

                return (
                  <details
                    key={layer.id}
                    open={layer.id !== activeLayer.id}
                    className={`border-2 p-2 ${ui.border}`}
                  >
                    <summary className="cursor-pointer font-bold uppercase">
                      {layer.name} ({blockedCount}/{layerTraits.length})
                    </summary>
                    <div className="mt-2 grid gap-2">
                      <button
                        onClick={() =>
                          setLayerIncompatibility(layer.id, !fullyBlocked)
                        }
                        className={`border-2 px-3 py-2 uppercase ${fullyBlocked ? ui.active : ui.inactive}`}
                      >
                        {fullyBlocked ? "Unblock Layer" : "Block Whole Layer"}
                      </button>

                      {layerTraits.map((trait) => (
                        <label
                          key={trait.id}
                          className={`flex items-center justify-between gap-2 border p-2 ${ui.input}`}
                        >
                          <span className="min-w-0 truncate">{trait.name}</span>
                          <input
                            type="checkbox"
                            checked={activeTrait.incompatibleWith.includes(
                              trait.id,
                            )}
                            onChange={() => toggleIncompatibility(trait.id)}
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>

            <div className={`mt-4 border-t-2 pt-3 ${ui.border}`}>
              <h2 className="mb-3 font-bold uppercase">Output</h2>
              <canvas
                ref={outputRef}
                className={`h-[256px] w-[256px] border-2 [image-rendering:pixelated] ${isDark ? "bg-black border-white" : "bg-white border-black"}`}
                style={{ imageRendering: "pixelated" }}
              />
              <div className="mt-3 grid gap-2">
                <button
                  onClick={randomizeOutput}
                  className={`border-2 px-3 py-2 uppercase ${ui.active}`}
                >
                  Randomize
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => downloadOutput(1)}
                    className={`border-2 px-2 py-2 uppercase ${ui.inactive}`}
                  >
                    1x Native
                  </button>
                  <button
                    onClick={() => downloadOutput(50)}
                    className={`border-2 px-2 py-2 uppercase ${ui.inactive}`}
                  >
                    50x
                  </button>
                  <button
                    onClick={() => downloadOutput(100)}
                    className={`border-2 px-2 py-2 uppercase ${ui.inactive}`}
                  >
                    100x
                  </button>
                </div>
                <button
                  onClick={generateCollection}
                  className={`border-2 px-3 py-2 uppercase ${ui.active}`}
                >
                  Generate Collection
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === "collection" && (
        <div className="grid grid-cols-[300px_1fr_320px] gap-4 max-xl:grid-cols-1">
          <aside className={`border-2 p-3 ${ui.panel}`}>
            <div className={`mb-3 border-b-2 pb-2 ${ui.border}`}>
              <h2 className="font-bold uppercase">Collection</h2>
              <p>
                {filteredItems.length} / {generatedItems.length} items
              </p>
            </div>
            <div className="grid gap-2">
              <button
                onClick={generateCollection}
                className={`border-2 px-3 py-2 uppercase ${ui.active}`}
              >
                Regenerate
              </button>
              <button
                onClick={shuffleCollection}
                disabled={!generatedItems.length}
                className={`border-2 px-3 py-2 uppercase disabled:opacity-30 ${ui.inactive}`}
              >
                Shuffle
              </button>
              <button
                onClick={() => {
                  setShareItems(
                    filteredItems.slice(
                      0,
                      shareSettings.grid * shareSettings.grid,
                    ),
                  );
                  setTab("share");
                }}
                disabled={!generatedItems.length}
                className={`border-2 px-3 py-2 uppercase disabled:opacity-30 ${ui.inactive}`}
              >
                Send To Share
              </button>
              <button
                onClick={exportMetadataJson}
                className={`border-2 px-3 py-2 uppercase ${ui.inactive}`}
              >
                Export Metadata JSON
              </button>
              <button
                onClick={exportTraitPngs}
                className={`border-2 px-3 py-2 uppercase ${ui.inactive}`}
              >
                Export Traits
              </button>
              <button
                onClick={exportFullCollectionPng}
                className={`border-2 px-3 py-2 uppercase ${ui.inactive}`}
              >
                Export Full PNG Sheet
              </button>
            </div>

            <div className={`my-4 border-t-2 pt-3 ${ui.border}`}>
              <h3 className="mb-2 font-bold uppercase">Stats</h3>
              <div className="grid gap-1">
                <p>Supply: {project.supply}</p>
                <p>Generated: {generatedItems.length}</p>
                <p>
                  Unique:{" "}
                  {new Set(generatedItems.map((item) => item.comboKey)).size}
                </p>
                <p>Valid combinations: {ruleAnalysis.capped ? "≥" : ""}{possibleCombinations.toLocaleString()}</p>
                <p>Rules: {ruleAnalysis.rules}</p>
                <p>Validation: {ruleAnalysis.errors.length ? `${ruleAnalysis.errors.length} error(s)` : "OK"}</p>
                <p>Layers: {project.layers.length}</p>
                <p>Traits: {traitCount}</p>
              </div>
            </div>

            <div className={`border-t-2 pt-3 ${ui.border}`}>
              <h3 className="mb-2 font-bold uppercase">Filter</h3>
              <button
                onClick={() => setActiveFilters({})}
                className={`mb-3 w-full border-2 px-3 py-2 uppercase ${ui.inactive}`}
              >
                Clear Filters
              </button>
              <div className="space-y-3">
                {project.layers.map((layer) => (
                  <details
                    key={layer.id}
                    open
                    className={`border-2 p-2 ${ui.border}`}
                  >
                    <summary className="cursor-pointer font-bold uppercase">
                      {layer.name} (
                      {layer.traits.reduce(
                        (sum, trait) => sum + (traitUsage[trait.id] ?? 0),
                        0,
                      )}
                      )
                    </summary>
                    <div className="mt-2 space-y-1">
                      {layer.traits.map((trait) => {
                        const checked = (
                          activeFilters[layer.id] ?? []
                        ).includes(trait.id);
                        return (
                          <label
                            key={trait.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleFilter(layer.id, trait.id)
                                }
                              />
                              <span className="truncate">{trait.name}</span>
                            </span>
                            <span>{traitUsage[trait.id] ?? 0}</span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </aside>

          <section className={`border-2 p-3 ${ui.panel}`}>
            <div className={`mb-3 border-b-2 pb-2 ${ui.border}`}>
              <h2 className="font-bold uppercase">Browser</h2>
              <p>
                Click an item to inspect traits. Browser thumbnails stay square
                and undistorted.
              </p>
            </div>
            {filteredItems.length === 0 ? (
              <div className={`border-2 p-8 text-center ${ui.border}`}>
                Generate a collection or clear filters.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                {filteredItems.slice(0, 600).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedGeneratedId(item.id)}
                    className={`border-2 p-2 text-left ${selectedGeneratedId === item.id ? ui.active : ui.inactive}`}
                  >
                    <span className="font-bold">#{item.id}</span>
                    <MiniPreview
                      item={item}
                      size={project.gridSize}
                      background="transparent"
                      scale={4}
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className={`border-2 p-3 ${ui.panel}`}>
            <div className={`mb-3 border-b-2 pb-2 ${ui.border}`}>
              <h2 className="font-bold uppercase">Inspector</h2>
            </div>
            {selectedItem ? (
              <div>
                <MiniPreview
                  item={selectedItem}
                  size={project.gridSize}
                  background="transparent"
                  scale={8}
                />
                <h3 className="mt-3 font-bold uppercase">#{selectedItem.id}</h3>
                <div className="mt-3 space-y-2">
                  {project.layers.map((layer) => {
                    const trait = layer.traits.find(
                      (item) => item.id === selectedItem.traitIds[layer.id],
                    );
                    if (!trait) return null;
                    return (
                      <div key={layer.id} className={`border p-2 ${ui.input}`}>
                        <div className="font-bold">{layer.name}</div>
                        <div>{trait.name}</div>
                        <div>
                          {
                            rarityOptions.find(
                              (item) => item.key === trait.rarity,
                            )?.label
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p>No item selected.</p>
            )}
          </aside>
        </div>
      )}

      {tab === "share" && (
        <div className="grid grid-cols-[330px_1fr] gap-4 max-xl:grid-cols-1">
          <aside className={`border-2 p-3 ${ui.panel}`}>
            <div className={`mb-3 border-b-2 pb-2 ${ui.border}`}>
              <h2 className="font-bold uppercase">Share Grid</h2>
              <p>
                {shareItems.length} items / {shareSettings.grid}x
                {shareSettings.grid} / Background {shareBackgroundLabel()}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block font-bold uppercase">
                  Grid Size
                </label>
                <div className="grid grid-cols-5 gap-1">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((grid) => (
                    <button
                      key={grid}
                      onClick={() => {
                        setShareSettings((current) => ({ ...current, grid }));
                        setShareItems(filteredItems.slice(0, grid * grid));
                      }}
                      className={`border px-2 py-2 ${shareSettings.grid === grid ? ui.active : ui.input}`}
                    >
                      {grid}x{grid}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block font-bold uppercase">
                  Frame Gap: {shareSettings.frame}px
                </span>
                <input
                  type="range"
                  min={0}
                  max={64}
                  value={shareSettings.frame}
                  onChange={(event) =>
                    setShareSettings((current) => ({
                      ...current,
                      frame: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-bold uppercase">
                  Outer Margin: {shareSettings.outerMargin}px
                </span>
                <input
                  type="range"
                  min={0}
                  max={160}
                  value={shareSettings.outerMargin}
                  onChange={(event) =>
                    setShareSettings((current) => ({
                      ...current,
                      outerMargin: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-bold uppercase">
                  Token Scale: {shareSettings.tokenScale}%
                </span>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={shareSettings.tokenScale}
                  onChange={(event) =>
                    setShareSettings((current) => ({
                      ...current,
                      tokenScale: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>

              <div>
                <label className="mb-2 block font-bold uppercase">
                  Background
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      "white",
                      "black",
                      "transparent",
                      "custom",
                    ] as ShareBackground[]
                  ).map((background) => (
                    <button
                      key={background}
                      onClick={() =>
                        setShareSettings((current) => ({
                          ...current,
                          background,
                        }))
                      }
                      className={`border-2 px-3 py-2 uppercase ${shareSettings.background === background ? ui.active : ui.inactive}`}
                    >
                      {background}
                    </button>
                  ))}
                </div>
                {shareSettings.background === "custom" && (
                  <input
                    type="color"
                    value={shareSettings.customBackground}
                    onChange={(event) =>
                      setShareSettings((current) => ({
                        ...current,
                        customBackground: event.target.value,
                      }))
                    }
                    className={`mt-2 h-10 w-full border-2 ${ui.input}`}
                  />
                )}
              </div>

              <div>
                <label className="mb-2 block font-bold uppercase">
                  Export Scale
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 5, 10].map((scale) => (
                    <button
                      key={scale}
                      onClick={() =>
                        setShareSettings((current) => ({
                          ...current,
                          exportScale: scale,
                        }))
                      }
                      className={`border-2 px-3 py-2 uppercase ${shareSettings.exportScale === scale ? ui.active : ui.inactive}`}
                    >
                      {scale}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <button
                  onClick={refreshShareItems}
                  disabled={!filteredItems.length}
                  className={`border-2 px-3 py-2 uppercase disabled:opacity-30 ${ui.inactive}`}
                >
                  Use Browser Selection
                </button>
                <button
                  onClick={shuffleCollection}
                  disabled={!generatedItems.length}
                  className={`border-2 px-3 py-2 uppercase disabled:opacity-30 ${ui.inactive}`}
                >
                  Shuffle Collection
                </button>
                <button
                  onClick={() => drawShareGrid()}
                  className={`border-2 px-3 py-2 uppercase ${ui.inactive}`}
                >
                  Refresh Preview
                </button>
                <button
                  onClick={downloadShareGrid}
                  disabled={!shareItems.length && !filteredItems.length}
                  className={`border-2 px-3 py-2 uppercase disabled:opacity-30 ${ui.active}`}
                >
                  Export Share PNG
                </button>
              </div>
            </div>
          </aside>

          <section className={`border-2 p-3 ${ui.panel}`}>
            <div className={`mb-3 border-b-2 pb-2 ${ui.border}`}>
              <h2 className="font-bold uppercase">Showcase Preview</h2>
              <p>A clean square social image. Max 10x10, so 100 tokens.</p>
            </div>
            {!generatedItems.length ? (
              <div className={`border-2 p-8 text-center ${ui.border}`}>
                Generate a collection first.
              </div>
            ) : (
              <div className="overflow-auto">
                <canvas
                  ref={shareRef}
                  className={`max-w-full border-2 [image-rendering:pixelated] ${ui.border}`}
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </main>
    </>
  );
}

function MiniPreview({
  item,
  size,
  background,
  scale = 3,
}: {
  item: GeneratedItem;
  size: number;
  background: string;
  scale?: number;
}) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    drawPixelsToCanvas(ref.current, item.pixels, size, scale, background);
  }, [item, size, background, scale]);

  return (
    <canvas
      ref={ref}
      className="mt-2 block aspect-square w-full [image-rendering:pixelated]"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
