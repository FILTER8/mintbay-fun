import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ADDRESS } from '@/lib/mintbay-gallery';
import { ProfileGallery } from '@/components/mintbay/profile-gallery';

type Props = { params: Promise<{ address: string }>; searchParams?: Promise<{ gallery?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!ADDRESS.test(address)) return { title: 'Gallery not found' };
  const wallet = address.toLowerCase();
  const url = `https://mintbay.fun/profile/${wallet}`;
  // A share-specific image URL avoids reusing an older image in X's image cache.
  const gallery = (await searchParams)?.gallery;
  const version = gallery && /^\d{10,16}$/.test(gallery) ? `?gallery=${gallery}` : '';
  const imageUrl = `${url}/opengraph-image${version}`;
  const title = `${address.slice(0, 8)}…${address.slice(-6)} / Mintbay Gallery`;
  const description = 'Latest 16 fully on-chain NFTs collected on Mintbay.';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: 'Mintbay.fun',
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: 'Mintbay latest 16 NFT gallery' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ProfileAddressPage({ params }: Props) {
  const { address } = await params;
  if (!ADDRESS.test(address)) notFound();

  return (
    <div className="interior section-wrap">
      <div className="inner-title">
        <div className="section-index">[ PROFILE / COLLECTION ]</div>
        <h1>MY GALLERY.</h1>
        <p className="mb-break">{address}</p>
      </div>
      <ProfileGallery address={address.toLowerCase()} />
    </div>
  );
}
