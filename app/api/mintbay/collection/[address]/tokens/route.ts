import { NextRequest, NextResponse } from 'next/server';
import { ADDRESS, collection, collectionTokens } from '@/lib/mintbay-gallery';
import { supportedChains } from '@/lib/chains';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sequential mint cursors are numeric. Alchemy returns an opaque page key;
// both are safely transmitted as a URL-encoded `start` query parameter.
const validCursor = (v: string) => v === '0' || /^n:\d{1,78}$/.test(v) || /^a:[A-Za-z0-9_=-]{1,512}$/.test(v);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const chainId = Number(req.nextUrl.searchParams.get('chainId') || 4663);
  if (!ADDRESS.test(address) || !supportedChains.some(chain => chain.id === chainId)) {
    return NextResponse.json({ error: 'Invalid contract or chain' }, { status: 400 });
  }
  if (!(await collection(address, chainId))) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }
  const start = req.nextUrl.searchParams.get('start') || '0';
  if (!validCursor(start)) {
    return NextResponse.json({ error: 'Invalid mint cursor. Sync latest to start again.' }, { status: 400 });
  }
  try {
    const result = await collectionTokens(address, start, 24, true, chainId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[mintbay/latest-mints]', { chainId, address, error });
    return NextResponse.json({ error: 'Mint feed temporarily unavailable. Please sync again.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
