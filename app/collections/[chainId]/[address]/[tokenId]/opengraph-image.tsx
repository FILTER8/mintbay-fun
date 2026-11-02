
import { ImageResponse } from 'next/og';
import {
  token,
  collection,
  ADDRESS,
  TOKEN,
} from '@/lib/mintbay-gallery';

export const runtime = 'nodejs';
export const alt = 'Mintbay on-chain NFT';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const chainNames: Record<number, string> = {
  1: 'ETHEREUM',
  130: 'UNICHAIN',
  137: 'POLYGON',
  4663: 'ROBINHOOD',
  8453: 'BASE',
  42161: 'ARBITRUM',
};

type ImageProps = {
  params: Promise<{
    chainId: string;
    address: string;
    tokenId: string;
  }>;
};

export default async function Image({ params }: ImageProps) {
  const { chainId, address, tokenId } = await params;

  const chain = Number(chainId);

  const valid =
    Object.hasOwn(chainNames, chain) &&
    ADDRESS.test(address) &&
    TOKEN.test(tokenId);

  const [n, c] = valid
    ? await Promise.all([
        token(address, tokenId, chain),
        collection(address, chain),
      ])
    : [null, null];

  let src: string | undefined;

  if (n?.image) {
    if (n.image.startsWith('data:image/svg+xml;base64,')) {
      try {
        const xml = Buffer.from(
          n.image.split(',')[1],
          'base64'
        ).toString('utf8');

        src = `data:image/svg+xml;base64,${Buffer.from(
          xml
        ).toString('base64')}`;
      } catch {
        // Fall back to placeholder artwork.
      }
    } else if (n.image.startsWith('https://')) {
      src = n.image;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: '#151515',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: 62,
          color: '#f5f5f0',
          fontFamily: 'monospace',
          gap: 60,
        }}
      >
        <div
          style={{
            width: 505,
            height: 505,
            background: '#f5f5f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {src ? (
            <img
              src={src}
              alt="On-chain NFT artwork"
              width={505}
              height={505}
              style={{
                imageRendering: 'pixelated',
              }}
            />
          ) : (
            <span style={{ fontSize: 110 }}>✳</span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 25,
            width: 480,
          }}
        >
          <span
            style={{
              fontSize: 28,
              color: '#d0ff49',
            }}
          >
            MINTBAY.FUN ✳
          </span>

          <span
            style={{
              fontSize: 57,
              fontWeight: 900,
            }}
          >
            {c?.name || 'ON-CHAIN ART'}
          </span>

          <span style={{ fontSize: 44 }}>
            #{tokenId}
          </span>

          <span
            style={{
              fontSize: 24,
              color: '#b5b5b5',
            }}
          >
            {`FULLY ON-CHAIN · ${chainNames[chain] || 'UNKNOWN'}`}
          </span>
        </div>
      </div>
    ),
    size
  );
}
