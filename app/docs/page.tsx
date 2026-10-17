import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, GitBranch, Blocks, Bot, Palette, Cpu } from 'lucide-react';
import './docs.css';

export const metadata: Metadata = {
  title: 'Developer Docs',
  description: 'Mintbay.fun developer handbook: immutable art builds, API endpoints, Net Protocol integration and Bankr agent-assisted deployment.',
};

const nav = [
  { heading: 'START HERE', items: [ ['overview', 'Overview'], ['quickstart', 'Quickstart'], ['architecture', 'Architecture'] ] },
  { heading: 'BUILD', items: [ ['studio-builds', 'Studio Builds'], ['api', 'API Reference'], ['contracts', 'Smart Contracts'] ] },
  { heading: 'INTEGRATIONS', items: [ ['net', 'Net Protocol'], ['bankr', 'Bankr Agents'] ] },
  { heading: 'ECOSYSTEM', items: [ ['remix', 'CC0 & Remix'], ['networks', 'Supported Chains'], ['roadmap', 'Roadmap'] ] },
] as const;

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="mbdocs-external">{children}<ArrowUpRight size={13} aria-hidden="true" /></a>;
}
function Tag({ children, kind = 'normal' }: { children: React.ReactNode; kind?: 'normal' | 'warning' | 'lime' }) {
  return <span className={`mbdocs-tag mbdocs-tag-${kind}`}>{children}</span>;
}
function Code({ children, label }: { children: string; label?: string }) {
  return <div className="mbdocs-code"><div className="mbdocs-codehead"><span>● ● ●</span><span>{label || 'TERMINAL'}</span></div><pre><code>{children}</code></pre></div>;
}
function Section({ id, n, title, lead, children }: { id: string; n: string; title: string; lead: string; children: React.ReactNode }) {
  return <section id={id} className="mbdocs-section"><div className="mbdocs-section-kicker">[ {n} / REFERENCE ]</div><h2>{title}</h2><p className="mbdocs-lead">{lead}</p>{children}</section>;
}

export default function DocsPage() {
  return <div className="mbdocs-root">
    <div className="mbdocs-mobile-nav"><label htmlFor="mbdocs-select">JUMP TO SECTION</label><div className="mbdocs-mobile-links">{nav.flatMap(g => g.items).map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}</div></div>
    <div className="mbdocs-shell">
      <aside className="mbdocs-sidebar" aria-label="Documentation navigation"><div className="mbdocs-side-inner"><div className="mbdocs-side-title"><BookOpen size={17}/> THE DOCS <span>V0.1</span></div>{nav.map(group => <div className="mbdocs-navgroup" key={group.heading}><div className="mbdocs-navhead">{group.heading}</div>{group.items.map(([id, title]) => <a key={id} href={`#${id}`} className="mbdocs-navlink"><span className="mbdocs-navdash">›</span>{title}</a>)}</div>)}<div className="mbdocs-side-bottom"><a href="https://github.com/FILTER8/mintbay-agent" target="_blank" rel="noopener noreferrer">GITHUB ↗</a><a href="https://api.mintbay.fun/health" target="_blank" rel="noopener noreferrer">API STATUS ↗</a></div></div></aside>
      <article className="mbdocs-content">
        <header className="mbdocs-intro"><div className="mbdocs-overline"><span className="mbdocs-dot"/> MINTBAY.FUN / DEVELOPER HANDBOOK <Tag kind="lime">EARLY ACCESS</Tag></div><h1>THE <span>DOCS.</span></h1><p>Build collections. Publish verifiable artwork. Connect on-chain culture to AI agents.</p><div className="mbdocs-heroactions"><Link href="/studio" className="mbdocs-primary">OPEN STUDIO <ArrowUpRight size={15}/></Link><a href="#quickstart" className="mbdocs-secondary">START READING ↓</a></div><div className="mbdocs-status"><span>ART / PIXELS / AGENTS</span><span>● API ONLINE</span><span>DOCS VERSION 0.1</span></div></header>

        <Section id="overview" n="001" title="Overview" lead="Mintbay is a playground for creating, launching and collecting fully on-chain generative pixel NFT collections.">
          <div className="mbdocs-feature-grid"><div><Palette size={21}/><h3>CREATE</h3><p>Make pixel artwork, layers and traits in Studio.</p></div><div><Blocks size={21}/><h3>PUBLISH</h3><p>Store a verifiable configuration and artwork build.</p></div><div><Bot size={21}/><h3>DEPLOY</h3><p>Prepare agent-assisted on-chain deployment with explicit approval.</p></div></div>
          <p>Every eligible CC0 collection can become a creative reference for future remixes. We are building toward AI-assisted generation, not claiming it is already available.</p>
        </Section>

        <Section id="quickstart" n="002" title="Quickstart" lead="Go from pixels to an immutable build manifest in three moves.">
          <ol className="mbdocs-steps"><li><strong>01 / Create</strong><p>Visit <Link href="/studio">Studio ↗</Link>. Draw artwork, create layers, adjust rarity, and preview combinations.</p></li><li><strong>02 / Publish</strong><p>Publish through Studio to create a build manifest with file URLs and SHA-256 hashes. Publishing a build is not deploying a contract.</p></li><li><strong>03 / Verify</strong><p>Read the manifest and its referenced config, artwork and compiled artwork. Verify hashes before any code generation or deployment.</p></li></ol>
          <Code label="READ A BUILD" >{'curl https://api.mintbay.fun/v1/builds/YOUR_BUILD_ID'}</Code>
        </Section>

        <Section id="architecture" n="003" title="Architecture" lead="Mintbay separates creative data, verification and blockchain execution.">
          <div className="mbdocs-diagram"><span>PIXEL STUDIO</span><b>→</b><span>BUILD API + R2</span><b>→</b><span>AGENT + REVIEW</span><b>→</b><span>EVM CONTRACT</span></div>
          <p><strong>Studio</strong> creates artwork and settings. <strong>Mintbay API</strong> validates and stores immutable build artifacts in Cloudflare R2. A compatible agent can retrieve and check the data. A collection deployer, once implemented and tested, will compile and deploy Solidity after a human approves the transaction.</p>
          <div className="mbdocs-note"><strong>IMPORTANT</strong><p>A stored build manifest is not a verified Solidity compilation and does not prove that an NFT has been deployed.</p></div>
        </Section>

        <Section id="studio-builds" n="004" title="Studio Builds" lead="An immutable build is a snapshot of the artwork and the collection's proposed configuration.">
          <p>The manifest records a build ID, selected chain, draft status, template information and three file references. Each artifact has a SHA-256 hash.</p><Code label="MANIFEST SHAPE">{`{
  "schemaVersion": 1,
  "status": "draft",
  "chainId": 4663,
  "template": { "name": "mintbay-net-collection-template", "version": "v5", "verified": false },
  "files": {
    "config": { "url": ".../config", "sha256": "..." },
    "artwork": { "url": ".../artwork", "sha256": "..." },
    "compiledArtwork": { "url": ".../compiled-artwork", "sha256": "..." }
  }
}`}</Code>
          <p>Old build manifests may reference <code>api.mintbay.xyz</code>. Keep those references valid and do not rewrite already-published artifacts.</p>
        </Section>

        <Section id="api" n="005" title="API Reference" lead="Read published builds and discover registered collections through the public Mintbay API.">
          <div className="mbdocs-endpoint"><Tag>GET</Tag><code>/health</code><span>Service status</span></div><div className="mbdocs-endpoint"><Tag>GET</Tag><code>/v1/builds/:id</code><span>Build manifest</span></div><div className="mbdocs-endpoint"><Tag>GET</Tag><code>/v1/builds/:id/config</code><span>Collection settings</span></div><div className="mbdocs-endpoint"><Tag>GET</Tag><code>/v1/builds/:id/artwork</code><span>Original art data</span></div><div className="mbdocs-endpoint"><Tag>GET</Tag><code>/v1/builds/:id/compiled-artwork</code><span>Compiled pixel traits</span></div><div className="mbdocs-endpoint"><Tag>GET</Tag><code>/v1/collections</code><span>Discovered collections after first mint</span></div><div className="mbdocs-endpoint"><Tag kind="warning">POST</Tag><code>/v1/builds</code><span>Authenticated publish endpoint</span></div><div className="mbdocs-endpoint"><Tag kind="warning">POST</Tag><code>/v1/deployments</code><span>Authenticated receipt-based registration</span></div>
          <Code label="PUBLIC API">{'const res = await fetch("https://api.mintbay.fun/v1/builds/YOUR_BUILD_ID");\nconst manifest = await res.json();\nconsole.log(manifest.files);'}</Code>
          <p>Uploads and deployment registration require server-side credentials. Never expose upload tokens or private API keys in a client-side app.</p>
        </Section>

        <Section id="contracts" n="006" title="Smart Contracts" lead="Mintbay's V5 design centers on lifetime supply, transparent mint economics and optional collection mechanics.">
          <div className="mbdocs-badgeline"><Tag kind="warning">SOLIDITY BUNDLE NOT YET AVAILABLE</Tag><Tag>V5 DESIGN</Tag></div>
          <p>Planned protocol rules include ERC-721A lifetime supply accounting, public minting, creator allowance, optional holder claim, Burn &amp; Claim, One Shot and supply reduction. A 5% platform fee is intended for paid primary mints; free mints are not charged that fee.</p>
          <p>Mintbay also plans integration with Net Protocol for app-indexed on-chain collection activity. Deployment, bytecode verification and royalty-validator availability must be checked per chain.</p>
          <div className="mbdocs-note"><strong>DEPLOYMENT GUARDRAIL</strong><p>The current <code>/v1/builds/:id/bundle</code> route returns HTTP 501. Do not treat a draft manifest as deployable source or ask an agent to execute an unverified contract.</p></div>
          <External href="https://github.com/FILTER8/mintbay-agent">Mintbay agent skill and protocol rules</External>
        </Section>

        <Section id="net" n="007" title="Built on Net Protocol" lead="Net Protocol is a decentralized on-chain messaging layer. It gives applications a public, queryable activity stream anchored to the blockchain.">
          <div className="mbdocs-partner"><div className="mbdocs-partner-head"><GitBranch size={22}/><div><strong>NET PROTOCOL</strong><small>FOUNDATIONAL INTEGRATION</small></div></div><p>Mintbay's Net-integrated collection design uses the collection contract as the Net app. Mint and transfer activity can be published as messages indexed under that contract address, creating an open record other apps can query or build on.</p><div className="mbdocs-links"><External href="https://www.netprotocol.app/">Net Protocol</External><External href="https://docs.netprotocol.app/">Official Net docs</External><External href="https://github.com/stuckinaboot/net-public">Net open-source SDK</External></div></div>
          <h3>Application messaging</h3><p>Net exposes <code>sendMessageViaApp</code> so a smart contract can publish a message attributed to an app and sender, with a text body, topic and bytes payload. The protocol indexes by app, sender and topic. <strong>Mintbay's precise emitted topics and chain deployments depend on its final collection contract.</strong></p>
          <Code label="NET INTERFACE / SOLIDITY">{`interface INet {
  function sendMessageViaApp(
    address sender,
    string calldata text,
    string calldata topic,
    bytes calldata data
  ) external;
}`}</Code>
          <p>Net's official docs list deployed networks and contract addresses. Do not assume Net is available on every Mintbay Studio chain without confirming its deployment first.</p>
        </Section>

        <Section id="bankr" n="008" title="Bankr Agents" lead="Bankr provides an AI agent runtime with wallets, tool access and smart-contract execution capabilities.">
          <div className="mbdocs-partner"><div className="mbdocs-partner-head"><Bot size={22}/><div><strong>BANKR</strong><small>AGENT-ASSISTED WORKFLOW</small></div></div><p>The intended Mintbay workflow is simple: publish a build, hand its URL to an agent equipped with the Mintbay skill, verify the source artifacts, review the proposed contract and approve any transaction explicitly.</p><div className="mbdocs-links"><External href="https://bankr.bot/">Bankr</External><External href="https://docs.bankr.bot/">Bankr docs</External><External href="https://github.com/FILTER8/mintbay-agent">Mintbay skill</External></div></div>
          <h3>Example agent request</h3><Code label="PROMPT / NOT AUTOMATIC EXECUTION">{'Hey @bankrbot, review my Mintbay build:\nhttps://api.mintbay.fun/v1/builds/YOUR_BUILD_ID\n\nUse the Mintbay skill. Verify the files and hashes,\ncheck the chain, fees and ownership settings.\nPrepare the deployment plan but do not deploy\nuntil I explicitly approve the final transaction.'}</Code>
          <div className="mbdocs-note"><strong>NOT LIVE YET</strong><p>The prompt is a target workflow, not a claim that V5 deploys are currently automated end-to-end. Never share wallet private keys or approval credentials in public posts.</p></div>
        </Section>

        <Section id="remix" n="009" title="CC0 & Remix" lead="Creative reuse is part of the design — and provenance still matters.">
          <p>Mintbay aims to let eligible CC0 pixel collections become reference material for remixing palettes, traits and compositions. Future Studio AI tools may help turn a prompt into editable collection JSON and support experimentation with styles.</p><p>Artwork created and published through Mintbay is intended to be dedicated under CC0 only when the creator has the necessary rights and makes that commitment. Third-party works are not automatically CC0.</p><Link href="/manual" className="mbdocs-textlink">READ THE MANUAL <ArrowUpRight size={16}/></Link>
        </Section>

        <Section id="networks" n="010" title="Supported Chains" lead="Studio currently allows six EVM chain selections for draft configuration.">
          <div className="mbdocs-chain-grid">{[['Robinhood Chain','4663'],['Base','8453'],['Ethereum','1'],['Polygon','137'],['Unichain','130'],['Arbitrum One','42161']].map(([name,id]) => <div key={id}><span>{name}</span><code>{id}</code></div>)}</div><p>Chain selection does not guarantee that the V5 template, Net Protocol contract or a royalty enforcement validator is deployed and supported there. Check individual integrations before execution.</p>
        </Section>

        <Section id="roadmap" n="011" title="What’s Next" lead="The docs will grow alongside the working protocol.">
          <div className="mbdocs-roadmap"><div><Tag kind="lime">AVAILABLE</Tag><strong>Studio + Immutable Build API</strong><p>Pixel art editing, draft publishing, hashes and build retrieval.</p></div><div><Tag kind="warning">IN PROGRESS</Tag><strong>V5 Contract Bundle + Verified Deployments</strong><p>Solidity generation, reproducible builds, tests and agent review.</p></div><div><Tag>PLANNED</Tag><strong>Remix Library + AI-Assisted Studio</strong><p>Community CC0 references, palette transformations and editable agent-generated artwork.</p></div></div>
          <div className="mbdocs-end"><Cpu size={23}/><div><strong>BUILD SOMETHING WEIRD.</strong><p>Docs are evolving. Verify critical behavior against live contracts and published source.</p></div><Link href="/studio">OPEN STUDIO ↗</Link></div>
        </Section>
        <footer className="mbdocs-foot">MINTBAY.FUN / DEVELOPERS <span>END OF DOCUMENT /// KEEP CREATING</span></footer>
      </article>
    </div>
  </div>;
}
