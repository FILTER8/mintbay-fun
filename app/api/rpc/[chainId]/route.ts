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
  const key = process.env.ALCHEMY_API_KEY;
  const rpcUrl = key && network ? `https://${network}.g.alchemy.com/v2/${key}` : publicRpc[id];
  try {
    const res=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(12000)});
    const data=await res.text();
    return new NextResponse(data,{status:res.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  } catch {return NextResponse.json({error:'RPC temporarily unavailable'}, {status:502});}
}
