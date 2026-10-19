"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const SETTINGS_KEY = "mintbay-pixelstudio-onchain-v5";
const DEFAULT_CREATOR_MESSAGE = [
  "+------------------------+",
  "|  MAKE ART HAVE FUN    |",
  "+------------------------+",
].join("\n");

function replaceOldSampleArt(value: string | undefined): string {
  if (!value || !value.trim()) return DEFAULT_CREATOR_MESSAGE;
  // Remove the previously shipped COOL DUDES sample, without overwriting genuine creator art.
  if (/COOL\s*DUDES/i.test(value) || (value.includes('$$$$$$') && value.includes('# |'))) return DEFAULT_CREATOR_MESSAGE;
  return value;
}
const API_BASE_URL = process.env.NEXT_PUBLIC_MINTBAY_API_BASE_URL || "https://api.mintbay.fun";
const MINTBAY_SKILL_URL = "https://github.com/FILTER8/mintbay-agent";
const DEFAULT_HOODIE_CONTRACT = "0x9Ec6C5b9f572A9B02138E553BC5F5882Da735F45";
const HOODIE_351_WALLET = "0xd3d65519d2285f7100eba318eb2ccc4b1763ca43";
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ETH_PRICE_PATTERN = /^\d+(\.\d{1,18})?$/;
const SUPPORTED_CHAINS = [
  { id: 4663, name: "Robinhood Chain" },
  { id: 8453, name: "Base" },
  { id: 1, name: "Ethereum" },
  { id: 137, name: "Polygon" },
  { id: 130, name: "Unichain" },
  { id: 42161, name: "Arbitrum One" },
] as const;
type HolderSource = { contract: string; priceEth: string }; // priceEth field retained for API compatibility; units are the network native token
const defaultHoodieSource = (): HolderSource => ({ contract: DEFAULT_HOODIE_CONTRACT, priceEth: "0" });

type ArtProject = {
  name: string;
  gridSize: number;
  supply: number;
  layers: Array<{
    name: string;
    traits: Array<{ name: string; weight: number; incompatibleWith: string[] }>;
  }>;
};

type AdminMode = "standard" | "hoodwallet";
type RoyaltyMode = "none" | "erc2981" | "enforced";

type OnchainSettings = {
  symbol: string;
  sourceHeaderArt: string;
  chainId: number;
  mintPriceEth: string;
  maxMintsPerWallet: number;
  creatorReserve: number;
  royaltyBps: number;
  royaltyReceiver: string;
  royaltySameAsDeployer: boolean;
  adminMode: AdminMode;
  deployerAddress: string;
  standardRoyalties: boolean;
  royaltyMode: RoyaltyMode;
  transferableOwnership: boolean;
  oneFreeMintPerHoodie: boolean;
  hoodieContract: string;
  burnForClaim: boolean;
  claimContractAddress: string;
  repositoryUrl: string;
  creatorMintEnabled: boolean;
  supplyReductionEnabled: boolean;
  payoutRecipient: string;
  payoutSameAsDeployer: boolean;
  holderClaimEnabled: boolean;
  holderCollection: string;
  claimsPerNft: number;
  holderSources: HolderSource[];
  burnClaimEnabled: boolean;
  burnClaimCollection: string;
  oneShotEnabled: boolean;
};

const defaultSettings: OnchainSettings = {
  symbol: "",
  sourceHeaderArt: DEFAULT_CREATOR_MESSAGE,
  chainId: 4663,
  mintPriceEth: "0.001",
  maxMintsPerWallet: 20,
  creatorReserve: 20,
  royaltyBps: 600,
  royaltyReceiver: "",
  royaltySameAsDeployer: true,
  adminMode: "standard",
  deployerAddress: "",
  standardRoyalties: true,
  royaltyMode: "erc2981",
  transferableOwnership: false,
  oneFreeMintPerHoodie: false,
  hoodieContract: DEFAULT_HOODIE_CONTRACT,
  burnForClaim: false,
  claimContractAddress: "",
  repositoryUrl: "",
  creatorMintEnabled: false,
  supplyReductionEnabled: false,
  payoutRecipient: "",
  payoutSameAsDeployer: true,
  holderClaimEnabled: true,
  holderCollection: DEFAULT_HOODIE_CONTRACT,
  holderSources: [defaultHoodieSource()],
  claimsPerNft: 1,
  burnClaimEnabled: false,
  burnClaimCollection: "",
  oneShotEnabled: false,
};

function addressOrNull(value: string): string | null {
  return value.trim() || null;
}

function getSymbol(name: string, customSymbol: string) {
  return (customSymbol.trim() || name.replace(/[^a-z0-9]/gi, "").slice(0, 10)).toUpperCase();
}

function normalizeSourceHeaderArt(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function sourceHeaderIssues(value: string): string[] {
  if (!value) return [];
  const issues: string[] = [];
  if (new TextEncoder().encode(value).length > 4096) issues.push("Creator message must be 4,096 bytes or fewer.");
  const lines = value.split("\n");
  if (lines.length > 64) issues.push("Creator message must be 64 lines or fewer.");
  if (lines.some(line => Array.from(line).length > 160)) issues.push("Creator message lines must be 160 Unicode characters or fewer.");
  // Allow visible Unicode (including box drawing, block glyphs, accented text and emoji).
  // Reject control, formatting, surrogate, and Unicode line-separator characters.
  // Tab and LF are the only allowed control characters.
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value.replace(/[\t\n]/g, ""))) {
    issues.push("Creator message contains invisible formatting or control characters. Visible Unicode art is allowed.");
  }
  return issues;
}

function buildConfig(project: ArtProject, settings: OnchainSettings) {
  const hasRoyalties = settings.royaltyMode !== "none";
  const payoutRecipient = settings.payoutSameAsDeployer
    ? addressOrNull(settings.deployerAddress)
    : addressOrNull(settings.payoutRecipient);
  const royaltyRecipient = settings.royaltySameAsDeployer
    ? addressOrNull(settings.deployerAddress)
    : addressOrNull(settings.royaltyReceiver);
  const holderSources = settings.holderClaimEnabled && Array.isArray(settings.holderSources) ? settings.holderSources : [];
  return {
    collection: {
      name: project.name,
      ...(settings.sourceHeaderArt ? { sourceHeaderArt: normalizeSourceHeaderArt(settings.sourceHeaderArt) } : {}),
      symbol: getSymbol(project.name, settings.symbol),
      chainId: settings.chainId,
      maxSupply: project.supply,
      mintPriceEth: settings.mintPriceEth,
      maxMintsPerWallet: settings.maxMintsPerWallet,
      creatorReserve: settings.creatorMintEnabled ? settings.creatorReserve : 0,
      royaltyBps: hasRoyalties ? settings.royaltyBps : 0,
      royaltyReceiver: hasRoyalties ? royaltyRecipient : null,
      payoutRecipient,
      platformFeeBps: 500,
      // The final owner is explicitly pinned even when Bankr deploys through CREATE2.
      deployerAddress: addressOrNull(settings.deployerAddress),
    },
    eligibility: {
      hoodieContract: holderSources.length === 1 && holderSources[0].priceEth === "0" ? addressOrNull(holderSources[0].contract) : null,
      freeMintsPerHoodieTokenId: holderSources.length === 1 && holderSources[0].priceEth === "0" ? settings.claimsPerNft : 0,
      claimRecipient: "caller",
      claimRequiresCurrentOwner: true,
      reservedSupplyForFreeClaims: 0,
    },
    // V5: all mint routes consume the same lifetime maxSupply; burns do not replenish it.
    mintbayV5: {
      schemaVersion: 5,
      platformFeeBps: 500,
      payoutRecipient,
      sharedLifetimeSupply: true,
      creatorMint: { enabled: settings.creatorMintEnabled, allowance: settings.creatorMintEnabled ? settings.creatorReserve : 0 },
      supplyReduction: { enabled: settings.supplyReductionEnabled },
      royalties: { enabled: hasRoyalties, mode: settings.royaltyMode, enforcementRequested: settings.royaltyMode === "enforced", validatorConfiguredAtDeployment: false, bps: hasRoyalties ? settings.royaltyBps : 0, recipient: hasRoyalties ? royaltyRecipient : null },
      holderClaim: {
        enabled: settings.holderClaimEnabled,
        sourceCollection: holderSources.length === 1 ? addressOrNull(holderSources[0].contract) : null,
        sourceCollections: holderSources.map((source) => ({ contract: source.contract.trim(), mintPriceEth: source.priceEth })),
        claimsPerToken: settings.holderClaimEnabled ? settings.claimsPerNft : 0,
      },
      burnAndClaim: {
        enabled: settings.burnClaimEnabled,
        sourceCollection: settings.burnClaimEnabled ? addressOrNull(settings.burnClaimCollection) : null,
        sourceCollections: settings.burnClaimEnabled ? [settings.burnClaimCollection.trim()] : [],
        claimRatio: 1,
      },
      oneShot: { enabled: settings.oneShotEnabled, maxRemintsPerLineage: 1, requiresUnusedLifetimeSupply: true },
      standardBurn: true,
      ownershipTransfer: { enabled: settings.transferableOwnership, twoStep: false },
    },
    deployment: {
      verifySource: true,
      requireApprovalBeforeTransactions: true,
      framework: "Mintbay V5.1 / MintbayNetIntegratedERC721A (Bankr CREATE2)",
      sourceArt: "collection/artwork.json",
      skillUrl: MINTBAY_SKILL_URL,
      adminMode: settings.adminMode,
      // V5.1 generator uses this as the final initialOwner, not necessarily the CREATE2 sender.
      expectedDeployer: addressOrNull(settings.deployerAddress),
      initialOwner: addressOrNull(settings.deployerAddress),
      baseContract: "assets/contracts/v5/MintbayNetIntegratedERC721A.sol",
    },
    features: {
      standardRoyalties: hasRoyalties,
      enforcedRoyalties: settings.royaltyMode === "enforced",
      creatorMint: settings.creatorMintEnabled,
      supplyReduction: settings.supplyReductionEnabled,
      holderClaim: settings.holderClaimEnabled,
      burnAndClaim: settings.burnClaimEnabled,
      oneShot: settings.oneShotEnabled,
      standardBurn: true,
      transferableOwnership: settings.transferableOwnership,
    },
  };
}

function buildBankrDeployPrompt(buildUrl: string, chainId: number) {
  const buildId = buildUrl.split("/").filter(Boolean).pop() || buildUrl;
  const chain = SUPPORTED_CHAINS.find((item) => item.id === chainId);
  if (!chain) throw new Error(`Unsupported deployment chain: ${chainId}`);
  return `@bankrbot deploy my Mintbay NFT collection on ${chain.name} (chain ID ${chain.id}).\nBuild ID: ${buildId}\nUse the official Mintbay skill.\nShow the contract transaction and verify the contracts.`;
}

export default function OnchainExportPanel({
  project,
  isDark,
}: {
  project: ArtProject;
  isDark: boolean;
}) {
  const [settings, setSettings] = useState<OnchainSettings>(defaultSettings);
  const [step, setStep] = useState(1);
  const wizardRef = useRef<HTMLDivElement | null>(null);
  const checksRef = useRef<HTMLDivElement | null>(null);
  const [showChecks, setShowChecks] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [publishPassword, setPublishPassword] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const fieldClass = `w-full border-2 px-3 py-2 font-mono text-sm ${isDark ? "border-white bg-black text-white" : "border-black bg-white text-black"}`;
  const panelClass = `border-2 p-4 ${isDark ? "border-white" : "border-black"}`;
  const buttonClass = `border-2 px-4 py-3 font-bold uppercase ${isDark ? "border-white hover:bg-white hover:text-black" : "border-black hover:bg-black hover:text-white"}`;

  useEffect(() => {
    // Load after hydration, without changing the server-rendered initial form.
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(SETTINGS_KEY);
        if (saved) {
          const parsed: Partial<OnchainSettings> = JSON.parse(saved);
          setSettings({
            ...defaultSettings,
            ...parsed,
            sourceHeaderArt: replaceOldSampleArt(parsed.sourceHeaderArt),
            holderSources: Array.isArray(parsed.holderSources) && parsed.holderSources.length
              ? parsed.holderSources.slice(0, 5)
              : (parsed.chainId === 4663 || parsed.chainId == null ? [defaultHoodieSource()] : []),
            royaltySameAsDeployer: parsed.royaltySameAsDeployer ?? false,
          });
        }
      } catch {
        // Local storage may be unavailable (private browsing).
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function saveSettings(next: OnchainSettings) {
    setSettings(next);
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Export still works without local storage.
    }
  }

  function update<K extends keyof OnchainSettings>(key: K, value: OnchainSettings[K]) {
    saveSettings({ ...settings, [key]: value });
    setFeedback("");
    setPublishedUrl("");
  }

  function useHoodieExample() {
    saveSettings({
      ...settings,
      symbol: "PORTRAIT",
      chainId: 4663,
      mintPriceEth: "0.001",
      maxMintsPerWallet: 20,
      creatorReserve: 20,
      standardRoyalties: true,
      royaltyBps: 600,
      royaltyReceiver: HOODIE_351_WALLET,
      royaltySameAsDeployer: true,
      adminMode: "hoodwallet",
      deployerAddress: HOODIE_351_WALLET,
      oneFreeMintPerHoodie: true,
      hoodieContract: DEFAULT_HOODIE_CONTRACT,
      burnForClaim: true,
      claimContractAddress: "",
      repositoryUrl: "",
      creatorMintEnabled: true,
      supplyReductionEnabled: true,
      payoutRecipient: HOODIE_351_WALLET,
      payoutSameAsDeployer: true,
      holderClaimEnabled: true,
      holderCollection: DEFAULT_HOODIE_CONTRACT,
      holderSources: [defaultHoodieSource()],
      claimsPerNft: 1,
      burnClaimEnabled: false,
      burnClaimCollection: "",
      oneShotEnabled: false,
    });
    setFeedback("Loaded Hoodie #351 sample settings — confirm your project artwork and supply.");
  }

  const warnings = useMemo(() => {
    const issues: string[] = [];
    if (!getSymbol(project.name, settings.symbol)) issues.push("Set a collection symbol.");
    issues.push(...sourceHeaderIssues(settings.sourceHeaderArt));
    if (!ETH_PRICE_PATTERN.test(settings.mintPriceEth)) issues.push("Mint price must be a non-negative native-token amount (ETH or POL) with at most 18 decimals.");
    if (!SUPPORTED_CHAINS.some((chain) => chain.id === settings.chainId)) issues.push("Select a supported blockchain.");
    if (settings.adminMode !== "standard") issues.push("Mintbay V5.1 currently supports standard owner addresses only; HoodWallet administration is not yet supported by the generator.");
    if (!Number.isInteger(settings.maxMintsPerWallet) || settings.maxMintsPerWallet < 0) issues.push("Public wallet limit must be 0 (unlimited) or higher.");
    if (settings.creatorMintEnabled && (!Number.isInteger(settings.creatorReserve) || settings.creatorReserve < 0 || settings.creatorReserve > project.supply)) issues.push("Creator allowance must be between 0 and total supply.");
    if (settings.royaltyMode !== "none" && (!Number.isInteger(settings.royaltyBps) || settings.royaltyBps < 0 || settings.royaltyBps > 10000)) issues.push("Royalties must be between 0 and 10,000 basis points.");
    if (settings.royaltyMode !== "none" && !ADDRESS_PATTERN.test((settings.royaltySameAsDeployer ? settings.deployerAddress : settings.royaltyReceiver).trim())) issues.push("Enter a valid royalty receiver or initial owner address.");
    if (settings.adminMode === "hoodwallet" && !ADDRESS_PATTERN.test(settings.deployerAddress.trim())) issues.push("Enter the actual HoodWallet administrator address.");
    if (!ADDRESS_PATTERN.test(settings.deployerAddress.trim())) issues.push("Enter a valid initial owner address (EOA or compatible multisig).");
    if (settings.payoutSameAsDeployer) {
      if (!ADDRESS_PATTERN.test(settings.deployerAddress.trim())) issues.push("Enter the initial owner wallet address for creator payout.");
    } else if (!ADDRESS_PATTERN.test(settings.payoutRecipient.trim())) {
      issues.push("Enter a valid creator payout address (EOA, multisig, or splitter).");
    }
    if (settings.holderClaimEnabled && (!Array.isArray(settings.holderSources) || settings.holderSources.length < 1 || settings.holderSources.length > 5)) issues.push("Add 1–5 Holder Claim collections.");
    if (settings.holderClaimEnabled && Array.isArray(settings.holderSources)) {
      const unique = new Set<string>();
      settings.holderSources.forEach((source, index) => {
        if (!ADDRESS_PATTERN.test(source.contract.trim())) issues.push(`Holder Claim #${index + 1}: enter a valid NFT contract address.`);
        if (!ETH_PRICE_PATTERN.test(source.priceEth)) issues.push(`Holder Claim #${index + 1}: enter a valid mint price (0 = free).`);
        const key = source.contract.trim().toLowerCase();
        if (ADDRESS_PATTERN.test(key) && unique.has(key)) issues.push(`Holder Claim #${index + 1}: duplicate source contract.`);
        unique.add(key);
      });
    }
    if (settings.holderClaimEnabled && (!Number.isSafeInteger(settings.claimsPerNft) || settings.claimsPerNft < 1)) issues.push("Claims per eligible NFT must be a positive whole number.");
    if (settings.burnClaimEnabled && !ADDRESS_PATTERN.test(settings.burnClaimCollection.trim())) issues.push("Enter a valid Burn & Claim source collection address.");
    return issues;
  }, [project, settings]);

  // Advisory notices never block exporting or publishing a draft.
  const notices = useMemo(() => {
    const items: string[] = [];
    const incompatibleCount = project.layers.reduce((n, layer) => n + layer.traits.filter((trait) => trait.incompatibleWith?.length).length, 0);
    if (incompatibleCount > 0) items.push(`${incompatibleCount} traits use compatibility rules. These rules are included in your artwork export.`);
    
    return items;
  }, [project]);

  const proposedConfig = useMemo(() => buildConfig(project, settings), [project, settings]);

  function goStep(next: number) {
    setStep(Math.max(1, Math.min(4, next)));
    window.requestAnimationFrame(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function errorStep(message: string): number {
    if (/symbol|mint price|chain|wallet limit|creator message/i.test(message)) return 1;
    if (/royalt|receiver|owner|deployer|payout|administrator|admin|ownership/i.test(message)) return 2;
    if (/holder claim|burn & claim|burn-source|eligible|claims per|creator allowance/i.test(message)) return 3;
    return 1;
  }

  function showValidation() {
    setShowChecks(true);
    window.requestAnimationFrame(() => checksRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function publishBuild() {
    if (warnings.length) { setFeedback("Fix the highlighted collection checks before publishing."); showValidation(); return; }
    if (!publishPassword.trim()) { setFeedback("Enter your publishing access code to upload to Mintbay API."); return; }
    setPublishing(true);
    setFeedback("Publishing immutable build to Mintbay API...");
    try {
      const response = await fetch("/api/studio/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Studio-Password": publishPassword },
        body: JSON.stringify({ config: proposedConfig, artwork: project }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.issues) ? `: ${result.issues.join("; ")}` : "";
        throw new Error(`${result.error || "Upload failed"}${details}`);
      }
      if (typeof result.url !== "string") throw new Error("Build URL missing from API response");
      setPublishedUrl(result.url);
      setPublishPassword("");
      setFeedback("Build published! Copy the Bankr production deployment prompt below. Bankr will request final approval before sending a transaction.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not publish the build");
    } finally { setPublishing(false); }
  }

  async function copyDeploymentPrompt() {
    if (!publishedUrl) { setFeedback("Publish a build first to obtain its immutable URL."); return; }
    try {
      await navigator.clipboard.writeText(buildBankrDeployPrompt(publishedUrl, settings.chainId));
      setFeedback("Copied production Bankr deployment prompt. Review Bankr’s deployment summary before approving.");
    } catch { setFeedback("Clipboard unavailable; deployment prompt could not be copied."); }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <div className={panelClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black uppercase">On-chain export / Bankr</h2>
            <p className="mt-2 max-w-3xl leading-relaxed">Set up your collection and upload the artwork and mint settings to Mintbay when ready.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.name.toLowerCase() === "8x8portait" && (
              <button type="button" onClick={useHoodieExample} className={buttonClass}>Load Hoodie #351 sample</button>
            )}
            <a href={`${API_BASE_URL}/health`} target="_blank" rel="noreferrer" className={buttonClass}>Mintbay API ↗</a>
          </div>
        </div>
        <p className="mt-3 border-l-4 border-current pl-3 opacity-80">Your artwork stays in your browser until you choose to publish the build. Publishing creates an immutable CC0 NFT art build, not a blockchain transaction.</p>
      </div>

      <div ref={wizardRef} className="scroll-mt-6 space-y-4">
        <div className="grid grid-cols-4 gap-2" aria-label="Collection setup steps">
          {(["MINT", "OWNER", "FEATURES", "PUBLISH"] as const).map((name, index) => {
            const number = index + 1;
            const hasError = warnings.some((warning) => errorStep(warning) === number);
            return <button type="button" key={name} onClick={() => goStep(number)} aria-current={step === number ? "step" : undefined}
              className={`border-2 px-2 py-3 text-center text-xs font-black sm:text-sm ${hasError ? "border-red-600 text-red-600" : step === number ? (isDark ? "border-white bg-white text-black" : "border-black bg-[#cbff45] text-black") : (isDark ? "border-white" : "border-black")}`}>
              {String(number).padStart(2, "0")} <span className="hidden sm:inline">/ {name}</span>{hasError ? " !" : ""}
            </button>;
          })}
        </div>
        {step === 1 && <div className={`${panelClass} space-y-3`}>
          <h3 className="font-black uppercase">01 / Mint settings</h3>
          <p className="opacity-70">Collection name and max supply come from the Design tab.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2">Name (from project)<input className={`${fieldClass} opacity-70`} value={project.name} readOnly /></label>
            <label>Symbol<input className={fieldClass} value={settings.symbol} placeholder={getSymbol(project.name, "")} maxLength={16} onChange={(event) => update("symbol", event.target.value)} /></label>
            <label>Blockchain
              <select className={fieldClass} value={settings.chainId} onChange={(event) => {
                const chainId = Number(event.target.value);
                saveSettings({ ...settings, chainId, holderClaimEnabled: false, holderSources: [], burnClaimEnabled: false, burnClaimCollection: "" });
                setPublishedUrl(""); setFeedback("");
              }}>
                {SUPPORTED_CHAINS.map((chain) => <option key={chain.id} value={chain.id}>{chain.name} ({chain.id})</option>)}
              </select>
            </label>
            <label>Supply (from project)<input className={`${fieldClass} opacity-70`} type="number" value={project.supply} readOnly /></label>
            <label>Public mint price ({settings.chainId === 137 ? "POL" : "ETH"}; 0 = free)<input className={fieldClass} inputMode="decimal" value={settings.mintPriceEth} onChange={(event) => update("mintPriceEth", event.target.value)} placeholder="0.001" /></label>
            <label>Public mints per wallet (0 = unlimited)<input className={fieldClass} type="number" min={0} step={1} value={settings.maxMintsPerWallet} onChange={(event) => update("maxMintsPerWallet", Number(event.target.value))} /></label>
          </div>
          <div className="space-y-2 border-t border-current pt-3">
            <label htmlFor="mintbay-source-header" className="block font-bold">Creator message / Unicode art (optional)</label>
            <p className="text-sm opacity-70">Adds a comment header to the future verified Solidity source. Not NFT artwork, metadata or on-chain storage. Supports Unicode block art and text. Maximum 4,096 UTF-8 bytes, 64 lines, 160 characters per line.</p>
            <p className="text-xs opacity-70">Edit or remove the framed message directly in the box below.</p>
            <textarea id="mintbay-source-header" className={`${fieldClass} min-h-40 resize-y whitespace-pre overflow-x-auto`} value={settings.sourceHeaderArt} onChange={(event) => update("sourceHeaderArt", normalizeSourceHeaderArt(event.target.value))} placeholder="Your creator message (optional)" rows={6} spellCheck={false} wrap="off" />
            {settings.sourceHeaderArt && <details className="text-sm"><summary className="cursor-pointer font-bold">Preview Solidity comments</summary><pre className="mt-2 max-h-64 overflow-auto border border-current p-3 text-xs">{settings.sourceHeaderArt.split("\n").map(line => `// ${line}`).join("\n")}</pre></details>}
          </div>
          <p className="opacity-70">0 mint price = free. 0 wallet limit = unlimited. Creator mints share the collection supply.</p>
          <p className="border-l-4 border-current pl-3">Mintbay automatically receives 5% of each paid public mint or paid Holder Claim. The creator’s 95% remains withdrawable. Free mints have no protocol fee.</p>
        </div>}

        {step === 2 && <div className={`${panelClass} space-y-3`}>
          <h3 className="font-black uppercase">02 / Administrator & royalties</h3>
          <label className="block">Net base contract
            <select value={settings.adminMode} className={fieldClass} onChange={(event) => update("adminMode", event.target.value as AdminMode)}>
              <option value="standard">Standard — final collection owner</option>
              <option value="hoodwallet" disabled>HoodWallet — not supported in V5.1</option>
            </select>
          </label>
          {settings.adminMode === "hoodwallet" ? (
            <label className="block">HoodWallet administrator address<input className={fieldClass} value={settings.deployerAddress} onChange={(event) => update("deployerAddress", event.target.value)} placeholder="0x..." spellCheck={false} /></label>
          ) : (
            <label className="block">Initial collection owner (EOA / multisig)
              <input className={fieldClass} value={settings.deployerAddress} onChange={(event) => update("deployerAddress", event.target.value)} placeholder="0x..." spellCheck={false}/>
            </label>
          )}
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={settings.payoutSameAsDeployer} onChange={(event) => update("payoutSameAsDeployer", event.target.checked)} />
            Creator payout: same as initial owner
          </label>
          {settings.payoutSameAsDeployer ? (
            <label className="block">Creator payout recipient
              <input className={`${fieldClass} opacity-70`} value={settings.deployerAddress} placeholder="Same as initial owner" readOnly />
            </label>
          ) : (
            <label className="block">Creator payout recipient (required)
              <input className={fieldClass} value={settings.payoutRecipient} onChange={(event) => update("payoutRecipient", event.target.value)} placeholder="0x... EOA, multisig or split contract" spellCheck={false}/>
            </label>
          )}
          <label className="block font-bold">Secondary royalties
            <select className={fieldClass} value={settings.royaltyMode} onChange={(event) => {
              const royaltyMode = event.target.value as RoyaltyMode;
              saveSettings({ ...settings, royaltyMode, standardRoyalties: royaltyMode !== "none" });
              setFeedback("");
            }}>
              <option value="none">None — no royalties</option>
              <option value="erc2981">ERC-2981 — marketplace-reported</option>
              <option value="enforced">Enforced — ERC721-C / OpenSea validator</option>
            </select>
          </label>
          {settings.royaltyMode !== "none" && (
            <>
              <label className="block">Royalties (basis points; 600 = 6%)<input className={fieldClass} type="number" min={0} max={10000} value={settings.royaltyBps} onChange={(event) => update("royaltyBps", Number(event.target.value))} /></label>
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.royaltySameAsDeployer} onChange={(event) => update("royaltySameAsDeployer", event.target.checked)}/> Royalty receiver: same as initial owner</label>
              <label className="block">Royalty receiver address
                <input className={`${fieldClass} ${settings.royaltySameAsDeployer ? "opacity-70" : ""}`} value={settings.royaltySameAsDeployer ? settings.deployerAddress : settings.royaltyReceiver} onChange={(event) => update("royaltyReceiver", event.target.value)} placeholder="0x..." spellCheck={false} readOnly={settings.royaltySameAsDeployer}/>
              </label>
            </>
          )}
          {settings.royaltyMode === "enforced" && (
            <p className="border-l-4 border-current pl-3 opacity-80">Requires the pinned V5 Limit Break transfer-validation implementation and a separate OpenSea activation step after deployment. Net Bazaar and other transfer routes may be incompatible until validation is disabled or configured. No validator is activated by publishing this draft.</p>
          )}
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.transferableOwnership} onChange={(event) => update("transferableOwnership", event.target.checked)} /> Transfer Ownership (optional)</label>
          <p className="opacity-70">Direct ownership transfer. Payout and royalty addresses stay unchanged; the new owner can update them.</p>
        </div>}

        {step === 3 && <div className={`${panelClass} space-y-3`}>
          <h3 className="font-black uppercase">03 / Optional features</h3>
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.creatorMintEnabled} onChange={(e) => update("creatorMintEnabled", e.target.checked)}/> Creator Mint</label>
          {settings.creatorMintEnabled && <label>Free creator mint allowance<input className={fieldClass} type="number" min={0} max={project.supply} value={settings.creatorReserve} onChange={(e) => update("creatorReserve", Number(e.target.value))}/></label>}
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.supplyReductionEnabled} onChange={(e) => update("supplyReductionEnabled", e.target.checked)}/> Supply Reduction</label>
          <p className="opacity-70">If enabled, the creator can permanently lower maxSupply down to lifetime mints; no NFT is destroyed.</p>
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.holderClaimEnabled} onChange={(e) => update("holderClaimEnabled", e.target.checked)}/> Holder Claim</label>
          {settings.holderClaimEnabled && (
            <div className="space-y-3 pl-4">
              {settings.holderSources.map((source, index) => (
                <div key={index} className="space-y-2 border p-3">
                  <div className="flex items-center justify-between"><strong>Eligible collection {index + 1}</strong>
                    {settings.holderSources.length > 1 && <button type="button" className="underline" onClick={() => update("holderSources", settings.holderSources.filter((_, i) => i !== index))}>Remove</button>}
                  </div>
                  <label className="block">ERC-721 contract address
                    <input className={fieldClass} value={source.contract} onChange={(e) => update("holderSources", settings.holderSources.map((item, i) => i === index ? { ...item, contract: e.target.value } : item))} placeholder="0x..." spellCheck={false}/>
                  </label>
                  <label className="block">Claim mint price ({settings.chainId === 137 ? "POL" : "ETH"}; 0 = free)
                    <input className={fieldClass} inputMode="decimal" value={source.priceEth} onChange={(e) => update("holderSources", settings.holderSources.map((item, i) => i === index ? { ...item, priceEth: e.target.value } : item))} placeholder="0" />
                  </label>
                </div>
              ))}
              {settings.holderSources.length < 5 && <button type="button" className={buttonClass} onClick={() => update("holderSources", [...settings.holderSources, { contract: "", priceEth: "0" }])}>+ Add NFT collection</button>}
              <label className="block">Claims per qualifying NFT ID
                <input className={fieldClass} type="number" min={1} step={1} value={settings.claimsPerNft} onChange={(e) => update("claimsPerNft", Number(e.target.value))}/>
              </label>
              <p className="opacity-70">Up to 5 collections. Every qualifying NFT ID has its own claim allowance. Paid claims also incur the 5% Mintbay fee.</p>
            </div>
          )}
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.burnClaimEnabled} onChange={(e) => update("burnClaimEnabled", e.target.checked)}/> Burn & Claim (1 NFT for 1 NFT)</label>
          {settings.burnClaimEnabled && <div className="space-y-2 pl-4"><label className="block">Eligible burn-source ERC-721 contract<input className={fieldClass} value={settings.burnClaimCollection} onChange={(e) => update("burnClaimCollection", e.target.value)} placeholder="0x..." spellCheck={false}/></label><p className="text-sm opacity-70">Burn one approved source NFT to mint one new NFT for free. The collector must approve the new contract to burn their source token first. A source NFT is permanently destroyed; the entire action reverts if minting fails.</p></div>}
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.oneShotEnabled} onChange={(e) => update("oneShotEnabled", e.target.checked)}/> One Shot (Burn & Remint)</label>
          {settings.oneShotEnabled && <p className="pl-4 opacity-70">One free replacement per token lineage; requires unused lifetime supply. The replacement cannot be reminted again.</p>}
          <p className="opacity-70">All mint routes share one first-come-first-served lifetime supply. Mintbay V5.1 tries up to ten seeds to avoid repeating a trait combination; duplicates are permitted if all attempts collide. Standard authorized NFT burn remains available.</p>
        </div>}

        {step === 4 && <div className={`${panelClass} space-y-3`}>
          <h3 className="font-black uppercase">04 / Publish build & deploy with Bankr</h3>
          <p className="opacity-70">Publishes a hashed, immutable Studio build. Bankr generates and deploys the contract after you approve the transaction. Publishing itself does not spend ETH or POL.</p>
          <p className="text-sm opacity-75">Publishing is currently invite-only while Mintbay is in testing. Need an access code? <a className="underline font-bold" href="https://x.com/mintbay_xyz" target="_blank" rel="noreferrer">Contact Mintbay ↗</a></p>
          <label className="block">Publishing access code
            <input className={fieldClass} type="password" autoComplete="off" value={publishPassword} onChange={(event) => setPublishPassword(event.target.value)} placeholder="Enter access code" />
          </label>
          <button type="button" className={buttonClass} disabled={publishing} onClick={publishBuild}>{publishing ? "Publishing..." : "Upload collection to Mintbay"}</button>
          {publishedUrl && <div className="space-y-2 border border-current p-3 break-all">
            <p className="font-bold">Uploaded collection build</p>
            <a href={publishedUrl} target="_blank" rel="noreferrer" className="underline">{publishedUrl}</a>
            <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => navigator.clipboard.writeText(publishedUrl)}>Copy build URL</button><button type="button" className={buttonClass} onClick={copyDeploymentPrompt}>Copy Bankr deployment prompt</button></div>
          </div>}
          <p className="opacity-70">After publishing, copy the production prompt and send it to Bankr. It will prepare the deployment and ask for final transaction approval.</p>
          {feedback && <p role="status" className="border-l-4 border-current pl-2 font-bold">{feedback}</p>}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className={buttonClass} disabled={step === 1} onClick={() => goStep(step - 1)}>← BACK</button>
          <span className="font-mono text-sm">STEP {step} / 4</span>
          {step < 4 ? <button type="button" className={`${buttonClass} ${isDark ? "bg-white text-black" : "bg-[#cbff45] text-black"}`} onClick={() => goStep(step + 1)}>NEXT →</button>
            : <button type="button" className={buttonClass} onClick={() => goStep(1)}>REVIEW SETTINGS ↗</button>}
        </div>
      </div>

      <div ref={checksRef} className={`${panelClass} scroll-mt-6 ${warnings.length ? "border-red-600 text-red-600" : ""}`}>
        <button type="button" onClick={() => setShowChecks(v => !v)} className="flex w-full items-center justify-between gap-2 text-left font-black uppercase">
          <span>Collection checks {warnings.length ? `— ${warnings.length} TO FIX` : "— ALL GOOD"}</span><span>{showChecks || warnings.length ? "−" : "+"}</span>
        </button>
        {(showChecks || warnings.length > 0) && <>
        {warnings.length > 0 ? (
          <div className="mt-2"><p className="font-bold">Please fix:</p><ul className="list-disc space-y-1 pl-5">{warnings.map((warning) => <li key={warning}><button type="button" className="text-left underline" onClick={() => goStep(errorStep(warning))}>{warning} → FIX IN STEP {errorStep(warning)}</button></li>)}</ul></div>
        ) : (
          <p className="mt-2">Configuration valid.</p>
        )}
        {notices.length > 0 && (
          <div className="mt-2"><p className="font-bold">Artwork rules:</p><ul className="list-disc space-y-1 pl-5">{notices.map((notice) => <li key={notice}>{notice}</li>)}</ul></div>
        )}
        </>}
      </div>
    </section>
  );
}
