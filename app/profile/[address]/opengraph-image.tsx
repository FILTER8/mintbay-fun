import { ImageResponse } from 'next/og';
import { ADDRESS, ownerTokens } from '@/lib/mintbay-gallery';

export const runtime = 'nodejs';
export const alt = 'Mintbay collector gallery: latest 16 fully on-chain NFTs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// Avoid repeated Alchemy lookups for each social-crawler request.
export const revalidate = 3600;

type Props = { params: Promise<{ address: string }> };

export default async function OpenGraphImage({ params }: Props) {
  const { address } = await params;
  const wallet = ADDRESS.test(address) ? address.toLowerCase() : '';
  let images: Array<{ image: string | null; key: string }> = [];
  if (wallet) {
    try {
      const tokens = await ownerTokens(wallet);
      images = tokens.slice(0, 16).map((n) => ({
        image: n.image,
        key: `${n.contract}:${n.tokenId}`,
      }));
    } catch (error) {
      console.error('Mintbay profile Open Graph image: artwork lookup failed', error);
    }
  }

  const shortAddress = wallet ? `${wallet.slice(0, 8)}…${wallet.slice(-6)}` : 'COLLECTOR';

  return new ImageResponse(
    <div style={{ width: 1200, height: 630, display: 'flex', background: '#151614', color: '#f7f7f1', padding: 36, fontFamily: 'monospace' }}>
      <div style={{ width: 558, height: 558, display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start' }}>
        {Array.from({ length: 16 }, (_, i) => {
          const item = images[i];
          return (
            <div key={item?.key || i} style={{ width: 135, height: 135, backgroundColor: '#f7f7f1', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              {item?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt="" width="135" height="135" style={{ width: 135, height: 135, objectFit: 'contain', imageRendering: 'pixelated' }} />
              ) : <div style={{ width: 135, height: 135, background: '#e6e6e1', display: 'flex' }} />}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 42, width: 510 }}>
        <div style={{ display: 'flex', color: '#cdff45', fontSize: 23, letterSpacing: 2 }}>MINTBAY.FUN ✳</div>
        <div style={{ display: 'flex', fontSize: 63, fontWeight: 900, lineHeight: 1.04, marginTop: 26 }}>MY GALLERY.</div>
        <div style={{ display: 'flex', fontSize: 23, marginTop: 26, color: '#ddddda' }}>{shortAddress}</div>
        <div style={{ display: 'flex', fontSize: 19, marginTop: 38, color: '#aaa9a4' }}>LATEST 16 / FULLY ON-CHAIN ART</div>
        <div style={{ display: 'flex', fontSize: 19, marginTop: 10, color: '#aaa9a4' }}>ROBINHOOD CHAIN</div>
      </div>
    </div>,
    size,
  );
}
