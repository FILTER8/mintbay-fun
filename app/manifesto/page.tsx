import Link from 'next/link';
import { ArrowUpRight, Asterisk } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'A New Era — The Mintbay Manifesto',
  description: 'When creating becomes easy, creating something worth collecting becomes the challenge. Style, strategy, art, and agents at Mintbay.fun.',
};

export default function ManifestoPage() {
  return <main className="interior section-wrap" style={{ paddingBlock: 'clamp(48px, 8vw, 112px)' }}>
    <div className="section-index">[ 001 / THE MINTBAY MANIFESTO ]</div>
    <div style={{ maxWidth: 940, marginTop: 24 }}>
      <p style={{ fontFamily: 'monospace', fontWeight: 800, letterSpacing: '.13em', marginBottom: 18 }}>A NEW ERA. <Asterisk size={18} style={{ display: 'inline-block', verticalAlign: 'middle' }} /></p>
      <h1 style={{ fontSize: 'clamp(2.6rem, 7.8vw, 7rem)', lineHeight: .98, fontWeight: 950, letterSpacing: '-.065em', margin: '0 0 28px' }}>STYLE <span style={{ color: '#8baf22' }}>×</span><br />STRATEGY.</h1>
      <p style={{ fontSize: 'clamp(1.4rem, 3vw, 2.6rem)', fontWeight: 850, lineHeight: 1.2, marginBottom: 22 }}>When creating becomes easy, creating something worth collecting becomes the challenge.</p>
      <p style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: '.08em', fontWeight: 800 }}>WELCOME TO MINTBAY.FUN. MAKE ART. HAVE FUN.</p>
    </div>
    <article style={{ maxWidth: 800, marginTop: 'clamp(55px, 10vw, 110px)', fontSize: 'clamp(1rem, 1.7vw, 1.2rem)', lineHeight: 1.8 }}>
      <section style={{ marginBottom: 64 }}>
        <h2 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 900, lineHeight: 1.1 }}>00 / A NEW ERA.</h2>
        <p>We are entering a paradigm shift. AI agents are changing how we create, trade and interact with the digital world. Blockchains give them the ability to inspect contracts, verify ownership and execute transactions with permission.</p>
        <p>Not long ago, launching an NFT collection required substantial technical knowledge. Today, that barrier is falling. We are approaching a world where creating a collection can begin with a single prompt.</p>
        <p>So what happens when everyone can create one? What makes a collection worth creating — and, more importantly, worth collecting?</p>
        <p>That question is why Mintbay.fun exists.</p>
      </section>
      <section style={{ marginBottom: 64 }}>
        <h2 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 900, lineHeight: 1.1 }}>01 / STYLE.</h2>
        <p>We can look at an image and feel something before we can explain why. One person loves quiet minimalism. Another loves aggressive color, intricate detail or a strange silhouette. Taste comes from culture, experience, memory and emotion.</p>
        <p>We call this <strong>STYLE</strong>.</p>
        <p>An agent can generate countless images, but quantity is not the same as identity. When images begin to look alike, what is missing is often the artist’s particular way of seeing.</p>
        <p>We believe human-made pixel art, curated palettes and distinctive visual systems can become an extraordinary creative language for agents to learn from — not a replacement for artists, but a new possibility for their work.</p>
        <p>When making images becomes easier, making images that mean something becomes more important.</p>
      </section>
      <section style={{ marginBottom: 64 }}>
        <h2 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 900, lineHeight: 1.1 }}>02 / STRATEGY.</h2>
        <p>Artwork is one half of collecting. The other half is the experience created by the contract.</p>
        <p><strong>QUANTITY. ACCESSIBILITY. PRICE.</strong></p>
        <p>How many NFTs can exist? Who can mint them? At what price? Can holders claim an edition? Can one work be burned to create another? Can an artwork have one more life?</p>
        <p>These rules turn a collection into a place for decisions. Agents are good at inspecting data, understanding eligibility and explaining what a contract allows.</p>
        <p>Imagine asking: <em>Can I mint for free? How many claims do I have? Can I burn an NFT I already own to receive this one? Has the collection sold out?</em></p>
        <p>Things that once required navigating complex interfaces can increasingly become a conversation. The agent should make the rules understandable, not make the collector’s decisions for them.</p>
      </section>
      <section style={{ marginBottom: 64 }}>
        <h2 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 900, lineHeight: 1.1 }}>03 / THE NEW COLLECTOR.</h2>
        <p>When deployment becomes easy, we believe people will still look for two things: <strong>something that makes them feel something, and something that gives them a reason to participate.</strong></p>
        <p>A distinctive image. A thoughtful set of rules. A token tied to a story, an experiment or a community. Utility need not be an endless list of promises. Sometimes it is simply a meaningful reason to care.</p>
      </section>
      <section style={{ marginBottom: 64 }}>
        <h2 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 900, lineHeight: 1.1 }}>04 / MINTBAY.FUN.</h2>
        <p>Mintbay.fun brings these ideas together: humans create pixel art, agents help turn it into fully on-chain NFT collections, and collectors explore the rules through interfaces, wallets and prompts.</p>
        <p>We want to make creation accessible without making creativity meaningless. We want collecting to be interesting without making it unnecessarily complicated. And we want to explore what happens when human style meets machine intelligence.</p>
        <p><strong>The technology should make the experience possible. The art should make it worth experiencing.</strong></p>
        <p>Welcome to a new era.</p>
      </section>
      <div style={{ borderTop: '3px solid currentColor', paddingTop: 24, display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 'clamp(1.3rem, 3vw, 2rem)' }}>MAKE ART. HAVE FUN.</strong>
        <Link href="/studio" className="btn btn-lime">START CREATING <ArrowUpRight size={18} /></Link>
      </div>
    </article>
  </main>;
}
