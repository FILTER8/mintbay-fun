import { NextRequest, NextResponse } from 'next/server';
import { ADDRESS, collection, collectionTokens } from '@/lib/mintbay-gallery';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  if (!ADDRESS.test(address) || !(await collection(address))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const start = req.nextUrl.searchParams.get('start') || '0';
  if (!/^\d{1,40}$/.test(start)) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
  }
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';
  try {
    const result = await collectionTokens(address, start, 24, fresh);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'NFT service unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
