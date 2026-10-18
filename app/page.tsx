import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Asterisk, Terminal, Shuffle, Layers3, Zap } from 'lucide-react';
import { chainNames, supportedChains } from '@/lib/chains';

// Change this path to replace the picture in the homepage art window.
// Place your replacement file at public/brand/hero-art.png (or update the path).
const HERO_ART_IMAGE = '/brand/mintbay-mark.png';

const steps = [
  { id: '01', title: 'CREATE', copy: 'Paint pixels, build traits and generate your own fully on-chain NFT collection.', icon: Layers3 },
  { id: '02', title: 'PUBLISH', copy: 'Turn your artwork and settings into a permanent build an AI agent can read and verify.', icon: Terminal },
  { id: '03', title: 'DEPLOY', copy: 'Ask Bankr or another compatible agent to deploy. Review the details before you approve.', icon: Zap },
  { id: '04', title: 'REMIX', copy: 'Take CC0 art into Studio. Change the colors, remix the traits and make something new.', icon: Shuffle },
];

// Example only. A real Build ID must come from a successfully published Studio build.
const bankrExample = '@bankrbot deploy my Mintbay NFT collection on Robinhood Chain. Build ID: YOUR_BUILD_ID. Use the official Mintbay skill. Show the contract details before deployment.';

export default function Home() {
  return (
    <>
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
            <div className="art-stage">
              <div className="corner-label top-left">[ PIXEL ART ]</div>
              <div className="corner-label top-right">GEN_001</div>
              <Image
                src={HERO_ART_IMAGE}
                alt="Mintbay pixel artwork — replaceable homepage hero"
                width={440}
                height={440}
                priority
                style={{ width: '72%', height: 'auto', maxWidth: 360, objectFit: 'contain', imageRendering: 'pixelated', display: 'block', margin: 'auto' }}
              />
              <div className="corner-label bottom-left">NFT ART / ON-CHAIN</div>
              <div className="corner-label bottom-right">CC0 ♥</div>
            </div>
            <div className="window-bottom"><span>● PIXEL COLLECTIONS</span><span>MADE TO BE REMIXED</span></div>
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
            <p>Every CC0 pixel collection expands a shared library of traits, palettes and styles — giving AI agents more to work with when creating and remixing the next generation of art.</p>
            <Link className="text-link" href="/manual">READ THE MANUAL <ArrowUpRight size={17} /></Link>
          </div>
        </div>
      </section>

      <section className="how-section">
        <div className="section-wrap">
          <div className="section-heading">
            <div><div className="section-index">[ 002 / HOW IT WORKS ]</div><h2>FOUR MOVES.<br />INFINITE POSSIBILITIES.</h2></div>
            <span className="margin-note">THE CREATIVE LOOP ↘</span>
          </div>
          <div className="steps-grid">
            {steps.map(s => (
              <div className="step-card" key={s.id}>
                <div className="step-card-head"><span>{s.id} / 04</span><s.icon size={23} strokeWidth={1.5} /></div>
                <div><h3>{s.title}</h3><p>{s.copy}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="last-call section-wrap">
        <div className="section-index">[ 003 / YOUR TURN ]</div>
        <div className="last-call-line">
          <h2>LESS TALK.<br /><span>MORE PIXELS.</span></h2>
          <Link href="/studio" className="giant-arrow" aria-label="Open Studio"><ArrowUpRight size={56} /></Link>
        </div>
        <p>CREATE YOUR COLLECTION. PUBLISH YOUR BUILD. ASK AN AGENT TO DEPLOY IT.</p>
        <div style={{ marginTop: '1.5rem', border: '2px solid currentColor', padding: '1rem 1.25rem', maxWidth: '860px', overflowWrap: 'anywhere' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.75rem' }}>EXAMPLE PROMPT / BANKR AGENT</span>
          <code style={{ fontFamily: 'inherit', fontSize: 'clamp(0.875rem, 1.25vw, 1rem)', lineHeight: 1.8 }}>{bankrExample}</code>
        </div>
      </section>
    </>
  );
}
