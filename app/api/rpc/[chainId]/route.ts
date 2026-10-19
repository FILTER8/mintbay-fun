import { NextRequest, NextResponse } from 'next/server';
import { alchemyNetwork, publicRpc } from '@/lib/chains';
export const runtime = 'nodejs';
const allowedMethods = new Set(['eth_chainId','net_version','eth_blockNumber','eth_call','eth_getBalance','eth_getTransactionCount','eth_getCode','eth_getStorageAt','eth_estimateGas','eth_gasPrice','eth_feeHistory','eth_maxPriorityFeePerGas','eth_getLogs','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber','eth_getBlockByHash','eth_getLogs','eth_getProof']);
export async function POST(request: NextRequest, context: {params:Promise<{chainId:string}>}) {
  const {chainId} = await context.params;
  const id = Number(chainId);
  if (!Number.isInteger(id) || !publicRpc[id]) return NextResponse.json({error:'Unsupported chain'}, {status:404});
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return NextResponse.json({error:'Expected JSON'}, {status:415});
  let payload: unknown;
  try { const raw = await request.text(); if(raw.length > 50000) throw Error('Payload too large'); payload=JSON.parse(raw); } catch {return NextResponse.json({error:'Invalid request'}, {status:400});}
  const entries = Array.isArray(payload) ? payload : [payload];
  if (!entries.length || entries.length > 20 || !entries.every((item) => item && typeof item === 'object' && 'method' in item && typeof item.method === 'string' && allowedMethods.has(item.method))) return NextResponse.json({error:'RPC method not allowed'}, {status:403});
  const network = alchemyNetwork[id];
  const apiKey = process.env.ALCHEMY_API_KEY;
  // Prefer the server-side Alchemy RPC for supported chains, including Robinhood.
  // The public RPC is an availability fallback, never a source of wallet keys.
  const endpoints = apiKey && network
    ? [`https://${network}.g.alchemy.com/v2/${apiKey}`, publicRpc[id]]
    : [publicRpc[id]];
  let lastStatus = 502;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.text();
      // Retry a different provider for upstream service failures or rate limits.
      // Do not retry JSON-RPC execution errors, which may be legitimate reverts.
      if ((res.status >= 500 || res.status === 429) && endpoint !== endpoints[endpoints.length - 1]) {
        lastStatus = res.status;
        continue;
      }
      return new NextResponse(data, {
        status: res.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    } catch {
      lastStatus = 502;
      // Try the next RPC endpoint on a network error or timeout.
    }
  }
  return NextResponse.json({error: 'Robinhood RPC temporarily unavailable. Retry in a moment.'}, {status: lastStatus === 429 ? 503 : 502});
}
