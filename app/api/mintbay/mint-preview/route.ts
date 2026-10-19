import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { token } from '@/lib/mintbay-gallery';

export const runtime = 'nodejs';
const TOKEN_ID = /^\d{1,78}$/;

// Read-only image preview from canonical on-chain tokenURI (Alchemy fallback).
// No transactions, approvals, or wallet permissions are involved.
export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') || '';
  const tokenId = request.nextUrl.searchParams.get('tokenId') || '';
  if (!isAddress(source) || !TOKEN_ID.test(tokenId)) {
    return NextResponse.json({ error: 'Invalid NFT' }, { status: 400 });
  }
  try {
    const nft = await token(source, tokenId);
    if (!nft) return NextResponse.json({ image: null, name: `#${tokenId}` }, { headers: { 'Cache-Control': 'public, max-age=30' } });
    return NextResponse.json({ image: nft.image, name: nft.name }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch {
    return NextResponse.json({ image: null, name: `#${tokenId}` }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
