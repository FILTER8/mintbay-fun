import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ADDRESS } from '@/lib/mintbay-gallery';
import { ProfileMuseum } from '@/components/mintbay/profile-museum';
import type { MuseumLayout, MuseumQuality, MuseumSettings } from '@/lib/mintbay-museum-engine';

type Params = {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const validLayout = (s: string): s is MuseumLayout => ['atrium', 'corridor', 'labyrinth'].includes(s);
const validQuality = (s: string): s is MuseumQuality => ['classic', 'pixel', 'balanced', 'full'].includes(s);
const read = (s: string | string[] | undefined) => typeof s === 'string' ? s : '';
const color = (s: string, fallback: string) => /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toLowerCase()}` : fallback;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { address } = await params;
  if (!ADDRESS.test(address)) return { title: 'Gallery not found' };
  const base = `https://mintbay.fun/profile/${address.toLowerCase()}`;
  const title = `Explore ${address.slice(0, 8)}…${address.slice(-6)}'s Museum`;
  return {
    title,
    description: 'A playable, pixel-rendered exhibition of art owned by a Mintbay collector.',
    alternates: { canonical: `${base}/gallery` },
    openGraph: { title, description: 'Explore this on-chain collection inside a personal museum.', url: `${base}/gallery`, images: [{ url: `${base}/opengraph-image`, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, images: [`${base}/opengraph-image`] },
  };
}

export default async function GalleryPage({ params, searchParams }: Params) {
  const { address } = await params;
  if (!ADDRESS.test(address)) notFound();
  const query = await searchParams;
  const layoutInput = read(query.layout);
  const qualityInput = read(query.quality);
  const d = Number(read(query.dither));
  const settings: MuseumSettings = {
    layout: validLayout(layoutInput) ? layoutInput : 'atrium',
    foreground: color(read(query.fg), '#ffffff'),
    background: color(read(query.bg), '#000000'),
    dither: read(query.dither) !== '' && Number.isFinite(d) ? Math.round(Math.max(0, Math.min(100, d))) : 50,
    quality: validQuality(qualityInput) ? qualityInput : 'pixel',
  };
  return <ProfileMuseum address={address.toLowerCase()} initialSettings={settings} />;
}
