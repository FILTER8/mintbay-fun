import { NextResponse } from 'next/server';
import { ADDRESS, ownerTokens } from '@/lib/mintbay-gallery';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!ADDRESS.test(address)) return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  try {
    return NextResponse.json(
      { tokens: await ownerTokens(address) },
      { headers: { 'Cache-Control': fresh ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=60' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ownership index unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
