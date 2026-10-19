import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Asterisk, Terminal, ShieldCheck, Layers3, Flame, ListChecks } from 'lucide-react';
import { chainNames, supportedChains } from '@/lib/chains';
import { HomeCollectionsCarousel, type HomeCollection } from '@/components/mintbay/home-collections-carousel';

const features = [
  { id: '01', title: 'DEPLOY WITH A PROMPT', copy: 'Publish your build and let an AI agent deploy your collection.', icon: Terminal },
  { id: '02', title: 'FULLY ON-CHAIN', copy: 'Your pixel artwork and token metadata live on-chain.', icon: Layers3 },
  { id: '03', title: 'ENFORCED ROYALTIES', copy: 'Configure creator royalties with supported marketplace enforcement.', icon: ShieldCheck },
  { id: '04', title: 'BURN FUNCTIONS', copy: 'Burn, Burn & Claim, and One Shot remix mechanics.', icon: Flame },
  { id: '05', title: 'ALLOWLISTS & CLAIMS', copy: 'Holder-based claims and custom mint permissions.', icon: ListChecks },
];

const bankrExample = '@bankrbot deploy my Mintbay NFT collection on Robinhood Chain.\nBuild ID: YOUR_BUILD_ID.\nUse the official Mintbay skill.\nShow the contract transaction and verify the contracts.';

async function latestCollections(): Promise<HomeCollection[]> {
  try {
    const response = await fetch('https://api.mintbay.fun/v1/collections', { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('collections' in payload) || !Array.isArray(payload.collections)) return [];
    return payload.collections.filter((entry): entry is HomeCollection => {
      if (!entry || typeof entry !== 'object') return false;
      const c = entry as Record<string, unknown>;
      return typeof c.chainId === 'number' && Number.isSafeInteger(c.chainId) && typeof c.contractAddress === 'string' && /^0x[0-9a-f]{40}$/i.test(c.contractAddress)
        && typeof c.name === 'string' && (c.previewImage == null || typeof c.previewImage === 'string');
    }).slice(0, 3);
  } catch {
    return [];
  }
}

export default async function Home() {
  const collections = await latestCollections();
  return (
    <>
      <style>{`
        /* Square collection artwork; the caption and carousel controls remain outside the square. */
        .hero-left,.hero-right{min-width:0}
        .hero-right .art-window{min-width:0;width:100%;overflow:hidden}
        .hero-right .art-stage{display:block;height:auto;min-height:0;overflow:hidden}
        .mb-home-carousel{display:flex;flex-direction:column;width:100%;height:auto;min-height:0;padding:12px;box-sizing:border-box;gap:10px}
        .mb-home-carousel-track{position:relative;display:flex;flex:none;min-width:0;min-height:0;width:100%;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain;gap:12px}
        .mb-home-carousel-track::-webkit-scrollbar{display:none}
        .mb-home-carousel-slide{position:relative;flex:0 0 100%;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;border:2px solid #151614;background:#f7f7f1;color:#151614;text-decoration:none;scroll-snap-align:start;scroll-snap-stop:always}
        .mb-home-carousel-art{position:relative;flex:none;width:100%;height:auto;aspect-ratio:1 / 1;min-height:0;background:#eeeee9;display:flex;align-items:center;justify-content:center;overflow:hidden}
        .mb-home-carousel-art img{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center;image-rendering:pixelated}
        .mb-home-carousel-caption{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-top:2px solid #151614;background:#f7f7f1}
        .mb-home-carousel-caption span{min-width:0;display:flex;flex-direction:column;gap:3px}
        .mb-home-carousel-caption small{font-size:10px;letter-spacing:.08em;opacity:.65;font-weight:700}
        .mb-home-carousel-caption strong{font-size:clamp(13px,1.3vw,18px);font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .mb-home-carousel-create,.mb-home-carousel-create .mb-home-carousel-art,.mb-home-carousel-create .mb-home-carousel-caption{background:#cbff45}
        .mb-home-carousel-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:34px;color:#151614}
        .mb-home-carousel-counter{font-family:monospace;font-size:13px;font-weight:900;white-space:nowrap}
        .mb-home-carousel-dots{display:flex;align-items:center;gap:8px}
        .mb-home-carousel-dot{display:block;width:10px;height:10px;border:2px solid #151614;background:transparent;cursor:pointer;padding:0;border-radius:0}
        .mb-home-carousel-dot.is-active{background:#151614}
        .mb-home-carousel-buttons{display:flex;gap:6px}
        .mb-home-carousel-buttons button{display:grid;place-items:center;width:35px;height:32px;background:#f7f7f1;color:#151614;border:2px solid #151614;cursor:pointer}
        .mb-home-carousel-buttons button:disabled{opacity:.32;cursor:default}
        .mb-home-feature-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
        .mb-home-feature-grid .step-card{min-width:0}
        .mb-home-prompt{margin-top:1.5rem;border:2px solid currentColor;padding:1.25rem;max-width:860px;overflow-wrap:anywhere}
        .mb-home-prompt code{display:block;font-family:inherit;font-size:clamp(.875rem,1.25vw,1rem);line-height:1.9;white-space:pre-wrap}
        @media(max-width:1000px){.mb-home-feature-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:640px){.mb-home-carousel{padding:8px;gap:8px}.mb-home-carousel-caption{padding:9px 11px}.mb-home-feature-grid{grid-template-columns:1fr}.mb-home-prompt{padding:1rem}}
      `}</style>
      <div className="ticker">
        <div className="ticker-track">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i}>
              ✳ NFT ART <b>{'///'}</b> AI AGENTS <b>{'///'}</b> CC0 REMIX CULTURE <b>{'///'}</b> FULLY ON-CHAIN <b>{'///'}</b> COPY · REMIX · REPEAT <b>{'///'}</b> NO GATEKEEPERS <b>{'///'}</b> BUILT FOR THE CURIOUS <b>{'///'}</b>{' '}
            </span>
          ))}
        </div>
      </div>

      <section className="hero section-wrap">
        <div className="hero-left">
          <div className="eyebrow">
            <span className="live-dot" /> AI AGENTS × NFT ART × CREATIVE FUN <span className="eyebrow-index">/ 001</span>
          </div>
          <h1>
            MAKE ART.<br />
            <span className="outline-type">HAVE</span>{' '}
            <span className="highlight-type">FUN<span className="punctuation">.</span></span>
          </h1>
          <p className="hero-lead">
            Make fully on-chain NFT collections without writing a line of Solidity.<br />
            Draw your pixels. Let an AI agent handle deployment.<br />
            Remix CC0 art and keep the internet fun.
          </p>
          <div className="hero-actions">
            <Link href="/studio" className="btn btn-lime">START CREATING <ArrowUpRight size={18} /></Link>
            <Link href="/collections" className="btn btn-outline">EXPLORE ART <ArrowRight size={18} /></Link>
          </div>
        </div>

        <div className="hero-right">
          <div className="art-window">
            <div className="window-bar"><span>✳</span><span>MINTBAY_ART.PNG</span><span className="window-end">□ ×</span></div>
            <div className="art-stage" style={{ display: 'block', padding: 0 }}>
              <HomeCollectionsCarousel collections={collections} />
            </div>
            <div className="window-bottom"><span>● LATEST COLLECTIONS</span><Link href="/collections" style={{ color: 'inherit', textDecoration: 'none' }}>VIEW ALL ↗</Link></div>
          </div>
          <div className="hero-sticker">AGENT<br />READY <Asterisk size={27} /></div>
        </div>
      </section>

      <div className="chain-strip">
        <span className="strip-label">SUPPORTED CHAINS [06]</span>
        <div className="chain-list">
          {supportedChains.map(c => <span key={c.id}><span className="tiny-asterisk">✳</span>{chainNames[c.id]}</span>)}
        </div>
      </div>

      <section className="manifesto section-wrap">
        <div className="section-index">[ 001 / THE IDEA ]</div>
        <div className="manifesto-layout">
          <h2>ART MEETS<br /><em>AGENTS.</em></h2>
          <div>
            <p>Mintbay makes creating, launching and collecting fully on-chain NFT collections fun and simple.</p>
            <p>Every CC0 pixel collection expands the Agent data set — more collections, better output.</p>
            <Link className="text-link" href="/manual">READ THE MANUAL <ArrowUpRight size={17} /></Link>
          </div>
        </div>
      </section>

      <section className="how-section">
        <div className="section-wrap">
          <div className="section-heading">
            <div><div className="section-index">[ 002 / FEATURES ]</div><h2>BUILT FOR<br />ON-CHAIN ART.</h2></div>
            <span className="margin-note">CREATOR TOOLS ↘</span>
          </div>
          <div className="mb-home-feature-grid">
            {features.map(s => (
              <div className="step-card" key={s.id}>
                <div className="step-card-head"><span>{s.id} / 05</span><s.icon size={23} strokeWidth={1.5} /></div>
                <div><h3>{s.title}</h3><p>{s.copy}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="last-call section-wrap">
        <div className="section-index">[ 003 / ONE PROMPT ]</div>
        <div className="last-call-line">
          <h2>ONE PROMPT.<br /><span>ON-CHAIN.</span></h2>
          <Link href="/studio" className="giant-arrow" aria-label="Open Studio"><ArrowUpRight size={56} /></Link>
        </div>
        <p>CREATE IN STUDIO. PUBLISH YOUR BUILD. DEPLOY WITH BANKR.</p>
        <div className="mb-home-prompt">
          <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.75rem' }}>EXAMPLE PROMPT / BANKR AGENT</span>
          <code>{bankrExample}</code>
        </div>
        <p style={{ marginTop: '1rem' }}><a href="https://github.com/FILTER8/mintbay-agent" target="_blank" rel="noreferrer" className="text-link">OFFICIAL MINTBAY SKILL <ArrowUpRight size={17} /></a></p>
      </section>
    </>
  );
}
