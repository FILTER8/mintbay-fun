import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, encodeAbiParameters, keccak256, isAddress } from 'viem';
import { robinhood } from '@/lib/chains';
import { collection } from '@/lib/mintbay-gallery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const API = process.env.MINTBAY_API_URL || 'https://api.mintbay.fun';
const ZERO = '0x0000000000000000000000000000000000000000' as const;
const abi = parseAbi([
  'function maxSupply() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function price() view returns (uint256)',
  'function publicMintsCount(address) view returns (uint256)',
  'function maxMintsPerWallet() view returns (uint256)',
  'function holderClaimEnabled() view returns (bool)',
  'function burnClaimEnabled() view returns (bool)',
  'function oneShotEnabled() view returns (bool)',
  'function approvedClaimCollections(address) view returns (bool approved, uint256 priceEth)',
  'function approvedBurnClaimCollections(address) view returns (bool)',
  'function claimsUsed(bytes32) view returns (uint256)',
  'function claimsPerToken() view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function oneShotRemint(uint256)',
]);
const client = createPublicClient({chain:robinhood,transport:http(process.env.ALCHEMY_API_KEY ? `https://robinhood-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : (process.env.ROBINHOOD_RPC_URL || 'https://rpc.robinhoodchain.com'))});
type Obj = Record<string,unknown>;
const obj=(v:unknown):Obj => v && typeof v==='object' && !Array.isArray(v) ? v as Obj : {};
const list=(v:unknown):unknown[] => Array.isArray(v)?v:[];
const text=(v:unknown):string=> typeof v==='string'?v:'';
const validToken=(v:string)=>/^\d{1,78}$/.test(v);
const asSources=(v:unknown):string[]=>list(v).map(x=>typeof x==='string'?x:text(obj(x).contract)).filter((s):s is `0x${string}`=>isAddress(s));
const get=(o:unknown,k:string):unknown=>obj(o)[k];
async function safeRead<T>(address:`0x${string}`,functionName:string,args:unknown[]=[],fallback:T):Promise<T>{
 try {return await client.readContract({address,abi,functionName: functionName as 'price',args:args as never}) as T;} catch{return fallback;}
}

// An indexed transfer query counts mint events, not current token ownership. Burned tokens still count.
// Bounded pagination prevents huge collections from hanging the route; unknown stays unknown.
async function lifetimeMinted(address:string,maxSupply:number):Promise<number|null>{
 const key=process.env.ALCHEMY_API_KEY;
 if(!key)return null;
 try{
  let pageKey:string|undefined, count=0;
  const limit=Math.min(Math.max(maxSupply+100,1000),20000);
  do{
   const params:Obj={fromAddress:ZERO,contractAddresses:[address],category:['erc721'],withMetadata:false,maxCount:'0x3e8'};
   if(pageKey)params.pageKey=pageKey;
   const r=await fetch(`https://robinhood-mainnet.g.alchemy.com/v2/${key}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'alchemy_getAssetTransfers',params:[params]}),signal:AbortSignal.timeout(9000),cache:'no-store'});
   const data:unknown=await r.json();
   if(!r.ok || get(data,'error'))return null;
   const result=get(data,'result');
   if(!Array.isArray(get(result,'transfers')))return null;
   count+=list(get(result,'transfers')).length;
   pageKey=text(get(result,'pageKey'))||undefined;
   if(count>limit)return null;
  }while(pageKey);
  return count;
 }catch{return null;}
}
async function owned(address:string,owner:string):Promise<Array<{contract:string;tokenId:string}>>{
 const key=process.env.ALCHEMY_API_KEY;
 if(!key)return [];
 let cursor:string|undefined;
 const all:Array<{contract:string;tokenId:string}>=[];
 for(let p=0;p<5;p++){
  const q=new URLSearchParams({owner, 'contractAddresses[]':address, pageSize:'100', withMetadata:'false'});
  if(cursor)q.set('pageKey',cursor);
  const r=await fetch(`https://robinhood-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner?${q}`,{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!r.ok)throw Error(`NFT ownership query failed (${r.status})`);
  const data:unknown=await r.json();
  for(const n of list(get(data,'ownedNfts'))){const id=String(get(n,'tokenId')??''); if(validToken(id))all.push({contract:address,tokenId:id});}
  cursor=text(get(data,'pageKey'))||undefined;
  if(!cursor)break;
 }
 return all;
}
export async function GET(request:NextRequest,{params}:{params:Promise<{address:string}>}){
 const {address}=await params;
 if(!isAddress(address))return NextResponse.json({error:'Invalid contract'},{status:400});
 const c=await collection(address).catch(()=>null);
 if(!c)return NextResponse.json({error:'Collection not registered'},{status:404});
 const contract=address as `0x${string}`;
 const wallet=request.nextUrl.searchParams.get('wallet')||'';
 if(wallet && !isAddress(wallet))return NextResponse.json({error:'Invalid wallet'},{status:400});
 const [max, circulating, price, transferCount, buildRes, publicCount, perWallet, holder, burn, oneShot, claimPerToken]=await Promise.all([
  safeRead(contract,'maxSupply',[],BigInt(c.maxSupply)),safeRead(contract,'totalSupply',[],BigInt(0)),safeRead(contract,'price',[],BigInt(0)),lifetimeMinted(address,c.maxSupply),
  fetch(`${API}/v1/builds/${(c as typeof c & {buildId?:string}).buildId}/config`,{next:{revalidate:600}}).then(r=>r.ok?r.json():null).catch(()=>null),
  wallet?safeRead(contract,'publicMintsCount',[wallet],BigInt(0)):Promise.resolve(BigInt(0)),
  safeRead(contract,'maxMintsPerWallet',[],BigInt(0)),
  safeRead(contract,'holderClaimEnabled',[],false),safeRead(contract,'burnClaimEnabled',[],false),safeRead(contract,'oneShotEnabled',[],false),safeRead(contract,'claimsPerToken',[],BigInt(0))
 ]);
 const minted=transferCount!==null && transferCount>=Number(circulating) ? transferCount : null;
 const v5=obj(get(buildRes,'mintbayV5'));
 const holderSources=holder?asSources(get(get(v5,'holderClaim'),'sourceCollections')):[];
 const burnSources=burn?asSources(get(get(v5,'burnAndClaim'),'sourceCollections')):[];
 const methods:{holder:Array<{source:string;tokenId:string;priceWei:string;remaining:number}>; burn:Array<{source:string;tokenId:string}>;oneShot:Array<{tokenId:string}>}={holder:[],burn:[],oneShot:[]};
 let eligibilityError:string|null=null;
 if(wallet){
  try {
   // Source candidates come from the immutable build, but eligibility is verified against live contract state.
   const sources=Array.from(new Set([...holderSources,...burnSources,...(oneShot?[address]:[])].map(s=>s.toLowerCase()))).slice(0,12);
   for(const source of sources){
    const target=source as `0x${string}`;
    const [nfts, holderSettings, burnApproved]=await Promise.all([
     owned(source,wallet),holder&&holderSources.some(s=>s.toLowerCase()===source)?safeRead(contract,'approvedClaimCollections',[source], [false,BigInt(0)] as readonly [boolean,bigint]):Promise.resolve([false,BigInt(0)] as readonly [boolean,bigint]),
     burn&&burnSources.some(s=>s.toLowerCase()===source)?safeRead(contract,'approvedBurnClaimCollections',[source],false):Promise.resolve(false)
    ]);
    for(const nft of nfts.slice(0,100)){
     const id=BigInt(nft.tokenId);
     const actualOwner=await safeRead(target,'ownerOf',[id],ZERO);
     if(actualOwner.toLowerCase()!==wallet.toLowerCase())continue;
     if(holderSettings[0]){
      const claimKey=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[target,id]));
      const used=await safeRead(contract,'claimsUsed',[claimKey],BigInt(0));
      const left=claimPerToken-used;
      if(left>BigInt(0))methods.holder.push({source,tokenId:nft.tokenId,priceWei:holderSettings[1].toString(),remaining:Number(left)});
     }
     if(burnApproved)methods.burn.push({source,tokenId:nft.tokenId});
     if(oneShot && source===address.toLowerCase()){
      // A successful eth_call proves both lineage eligibility and spare lifetime capacity.
      try {await client.simulateContract({address:contract,abi,functionName:'oneShotRemint',args:[id],account:wallet as `0x${string}`});methods.oneShot.push({tokenId:nft.tokenId});}catch{}
     }
    }
   }
  }catch(e){eligibilityError=e instanceof Error?e.message:'Eligibility temporarily unavailable';}
 }
 const remainingAllowance=perWallet===BigInt(0)?null:Math.max(0,Number(perWallet-publicCount));
 return NextResponse.json({maxSupply:Number(max),minted,priceWei:price.toString(),remainingAllowance,features:{holder,burn,oneShot},methods,eligibilityError},{headers:{'Cache-Control':'no-store'}});
}
