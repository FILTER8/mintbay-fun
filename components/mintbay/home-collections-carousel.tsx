'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, ArrowUpRight, Plus } from 'lucide-react';

export type HomeCollection = {
  chainId: number;
  contractAddress: string;
  name: string;
  previewImage: string | null;
};

export function HomeCollectionsCarousel({ collections }: { collections: HomeCollection[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const total = collections.length + 1;

  function go(index: number) {
    const target = Math.max(0, Math.min(total - 1, index));
    const node = track.current;
    if (!node) return;
    const slide = node.children.item(target);
    if (slide instanceof HTMLElement) {
      node.scrollTo({ left: slide.offsetLeft - node.offsetLeft, behavior: 'smooth' });
      setActive(target);
    }
  }

  function updateActive() {
    const node = track.current;
    if (!node) return;
    const items = Array.from(node.children) as HTMLElement[];
    const offset = node.scrollLeft;
    let closest = 0;
    let difference = Infinity;
    items.forEach((item, i) => {
      const delta = Math.abs(item.offsetLeft - node.offsetLeft - offset);
      if (delta < difference) { difference = delta; closest = i; }
    });
    setActive(closest);
  }

  return (
    <div className="mb-home-carousel">
      <div className="mb-home-carousel-track" ref={track} onScroll={updateActive} aria-label="Latest Mintbay collections">
        {collections.map((collection, index) => (
          <Link
            key={`${collection.chainId}:${collection.contractAddress}`}
            className="mb-home-carousel-slide"
            href={`/collections/${collection.chainId}/${collection.contractAddress}`}
            aria-label={`Open ${collection.name}`}
          >
            <div className="mb-home-carousel-art">
              {collection.previewImage ? (
                <Image
                  src={collection.previewImage}
                  alt={`${collection.name} on-chain artwork`}
                  fill
                  unoptimized
                  sizes="(max-width: 700px) 85vw, 540px"
                  style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
                  priority={index === 0}
                />
              ) : <span>ON-CHAIN ART</span>}
            </div>
            <div className="mb-home-carousel-caption">
              <span><small>COLLECTION {String(index + 1).padStart(2, '0')}</small><strong>{collection.name}</strong></span>
              <ArrowUpRight size={22} aria-hidden="true" />
            </div>
          </Link>
        ))}
        <Link className="mb-home-carousel-slide mb-home-carousel-create" href="/studio" aria-label="Create your own collection">
          <div className="mb-home-carousel-art"><Plus size={94} strokeWidth={1.5} aria-hidden="true" /></div>
          <div className="mb-home-carousel-caption"><span><small>YOUR TURN</small><strong>CREATE A COLLECTION</strong></span><ArrowUpRight size={22} aria-hidden="true" /></div>
        </Link>
      </div>
      <div className="mb-home-carousel-controls">
        <span className="mb-home-carousel-counter">{String(active + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
        <div className="mb-home-carousel-dots" aria-label="Carousel slides">
          {Array.from({ length: total }, (_, index) => (
            <button key={index} type="button" aria-label={`Show slide ${index + 1}`} aria-current={active === index ? 'true' : undefined}
              className={`mb-home-carousel-dot${active === index ? ' is-active' : ''}`} onClick={() => go(index)} />
          ))}
        </div>
        <div className="mb-home-carousel-buttons">
          <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous collection"><ArrowLeft size={20} /></button>
          <button type="button" onClick={() => go(active + 1)} disabled={active === total - 1} aria-label="Next collection"><ArrowRight size={20} /></button>
        </div>
      </div>
    </div>
  );
}
