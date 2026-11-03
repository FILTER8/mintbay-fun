import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, encodeAbiParameters, keccak256, isAddress } from 'viem';
import { supportedChains, publicRpc, alchemyNetwork } from '@/lib/chains';
import { collection } from '@/lib/mintbay-gallery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const API = process.env.MINTBAY_API_URL || 'https://api.mintbay.fun';
const ZERO = '0x0000000000000000000000000000000000000000' as const;
// One legacy collection, no change to V5.1 collections.
const LEGACY_8X8 = '0x2ee6305804dd94f7ff695c5ab1f3ae805f317653';
const LEGACY_HOODIE = '0x9Ec6C5b9f572A9B02138E553BC5F5882Da735F45';
const legacyAbi = parseAbi([
  'function hoodieClaimed(uint256) view returns (bool)',
  'function freeMint(uint256)',
]);
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
const getClient=(chainId:number)=>createPublicClient({chain:supportedChains.find(c=>c.id===chainId)!,transport:http(process.env.ALCHEMY_API_KEY&&alchemyNetwork[chainId]?`https://${alchemyNetwork[chainId]}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`:publicRpc[chainId])});
type Obj = Record<string,unknown>;
const obj=(v:unknown):Obj => v && typeof v==='object' && !Array.isArray(v) ? v as Obj : {};
const list=(v:unknown):unknown[] => Array.isArray(v)?v:[];
const text=(v:unknown):string=> typeof v==='string'?v:'';
const validToken=(v:string)=>/^\d{1,78}$/.test(v);
const asSources=(v:unknown):string[]=>list(v).map(x=>typeof x==='string'?x:text(obj(x).contract)).filter((s):s is `0x${string}`=>isAddress(s));
const get=(o:unknown,k:string):unknown=>obj(o)[k];
async function safeRead<T>(client:ReturnType<typeof getClient>,address:`0x${string}`,functionName:string,args:unknown[]=[],fallback:T):Promise<T>{
 try {return await client.readContract({address,abi,functionName: functionName as 'price',args:args as never}) as T;} catch{return fallback;}
}

// An indexed transfer query counts mint events, not current token ownership. Burned tokens still count.
// Bounded pagination prevents huge collections from hanging the route; unknown stays unknown.
async function lifetimeMinted(address:string,maxSupply:number,chainId:number):Promise<number|null>{
 const key=process.env.ALCHEMY_API_KEY;
 if(!key||!alchemyNetwork[chainId])return null;
 try{
  let pageKey:string|undefined, count=0;
  const limit=Math.min(Math.max(maxSupply+100,1000),20000);
  do{
   const params:Obj={fromAddress:ZERO,contractAddresses:[address],category:['erc721'],withMetadata:false,maxCount:'0x3e8'};
   if(pageKey)params.pageKey=pageKey;
   const r=await fetch(`https://${alchemyNetwork[chainId]}.g.alchemy.com/v2/${key}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'alchemy_getAssetTransfers',params:[params]}),signal:AbortSignal.timeout(9000),cache:'no-store'});
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
async function owned(address:string,owner:string,chainId:number):Promise<Array<{contract:string;tokenId:string}>>{
 const key=process.env.ALCHEMY_API_KEY;
 if(!key||!alchemyNetwork[chainId])return [];
 let cursor:string|undefined;
 const all:Array<{contract:string;tokenId:string}>=[];
 for(let p=0;p<5;p++){
  const q=new URLSearchParams({owner, 'contractAddresses[]':address, pageSize:'100', withMetadata:'false'});
  if(cursor)q.set('pageKey',cursor);
  const r=await fetch(`https://${alchemyNetwork[chainId]}.g.alchemy.com/nft/v3/${key}/getNFTsForOwner?${q}`,{signal:AbortSignal.timeout(10000),cache:'no-store'});
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
 const chainId=Number(request.nextUrl.searchParams.get('chainId')||4663);
 if(!supportedChains.some(c=>c.id===chainId))return NextResponse.json({error:'Unsupported chain'},{status:400});
 const client=getClient(chainId);
 const c=await collection(address,chainId).catch(()=>null);
 if(!c)return NextResponse.json({error:'Collection not registered'},{status:404});
  const contract=address as `0x${string}`;
  const isLegacy8x8=address.toLowerCase()===LEGACY_8X8;
 const wallet=request.nextUrl.searchParams.get('wallet')||'';
 if(wallet && !isAddress(wallet))return NextResponse.json({error:'Invalid wallet'},{status:400});
 const [max, circulating, price, transferCount, buildRes, publicCount, perWallet, holder, burn, oneShot, claimPerToken]=await Promise.all([
  safeRead(client,contract,'maxSupply',[],BigInt(c.maxSupply)),safeRead(client,contract,'totalSupply',[],BigInt(0)),safeRead(client,contract,'price',[],BigInt(0)),lifetimeMinted(address,c.maxSupply,chainId),
  fetch(`${API}/v1/builds/${(c as typeof c & {buildId?:string}).buildId}/config`,{next:{revalidate:600}}).then(r=>r.ok?r.json():null).catch(()=>null),
  wallet?safeRead(client,contract,'publicMintsCount',[wallet],BigInt(0)):Promise.resolve(BigInt(0)),
  safeRead(client,contract,'maxMintsPerWallet',[],BigInt(0)),
  safeRead(client,contract,'holderClaimEnabled',[],false),safeRead(client,contract,'burnClaimEnabled',[],false),safeRead(client,contract,'oneShotEnabled',[],false),safeRead(client,contract,'claimsPerToken',[],BigInt(0))
 ]);
 const minted=transferCount!==null && transferCount>=Number(circulating) ? transferCount : null;
 // Read the schema of the immutable Studio build. V6 and V5.1 use the same
 // Holder Claim contract ABI, but store feature configuration under different keys.
 const buildConfig=obj(buildRes);
 const v6=obj(get(buildConfig,'mintbayV6'));
 const v5=obj(get(buildConfig,'mintbayV5'));
 const features=Number(get(v6,'schemaVersion'))===6 ? v6 : v5;
 const holderSources=holder?asSources(get(get(features,'holderClaim'),'sourceCollections')):[];
 const burnSources=burn?asSources(get(get(features,'burnAndClaim'),'sourceCollections')):[];
 const methods:{holder:Array<{source:string;tokenId:string;priceWei:string;remaining:number}>; burn:Array<{source:string;tokenId:string}>;oneShot:Array<{tokenId:string}>}={holder:[],burn:[],oneShot:[]};
 let eligibilityError:string|null=null;
 if(wallet){
  try {
   // Build configuration supplies candidate collections; the destination contract is the
   // authority for whether a source and each source token are actually claimable.
   const sources=Array.from(new Set([...holderSources,...burnSources,...(oneShot?[address]:[])].map(s=>s.toLowerCase())));
   if(sources.length>32)throw Error('Too many claim source collections (maximum 32)');

   // Independent sources run concurrently. For each source, batch on-chain reads
   // rather than sending ownerOf + claimsUsed RPCs serially for every token.
   const sourceResults=await Promise.allSettled(sources.map(async source=>{
    const target=source as `0x${string}`;
    const isHolderSource=holder&&holderSources.some(s=>s.toLowerCase()===source);
    const isBurnSource=burn&&burnSources.some(s=>s.toLowerCase()===source);
    const [nfts,holderSettings,burnApproved]=await Promise.all([
     owned(source,wallet,chainId),
     isHolderSource?safeRead(client,contract,'approvedClaimCollections',[target],[false,BigInt(0)] as readonly [boolean,bigint]):Promise.resolve([false,BigInt(0)] as readonly [boolean,bigint]),
     isBurnSource?safeRead(client,contract,'approvedBurnClaimCollections',[target],false):Promise.resolve(false),
    ]);
    const result={holder:[] as typeof methods.holder,burn:[] as typeof methods.burn,oneShot:[] as typeof methods.oneShot};
    if(!holderSettings[0]&&!burnApproved&&!(oneShot&&source===address.toLowerCase()))return result;
    const ids=[...new Set(nfts.map(n=>n.tokenId))].filter(validToken);
    // Keep individual multicalls bounded. 500 tokens can be returned by Alchemy per source.
    for(let offset=0;offset<ids.length;offset+=50){
     const batch=ids.slice(offset,offset+50);
     const calls=batch.flatMap(tokenId=>{
      const id=BigInt(tokenId);
      const ownership={address:target,abi,functionName:'ownerOf' as const,args:[id]} as const;
      if(!holderSettings[0])return [ownership];
      const claimKey=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[target,id]));
      const usage={address:contract,abi,functionName:'claimsUsed' as const,args:[claimKey]} as const;
      return [ownership,usage];
     });
     const reads=await client.multicall({contracts:calls,allowFailure:true});
     let index=0;
     const eligibleOneShot:string[]=[];
     for(const tokenId of batch){
      const ownerResult=reads[index++];
      const usedResult=holderSettings[0]?reads[index++]:null;
      if(ownerResult.status!=='success'||String(ownerResult.result).toLowerCase()!==wallet.toLowerCase())continue;
      if(holderSettings[0]&&usedResult?.status==='success'){
       const left=claimPerToken-BigInt(usedResult.result as bigint);
       if(left>BigInt(0))result.holder.push({source,tokenId,priceWei:holderSettings[1].toString(),remaining:Number(left)});
      }
      if(burnApproved)result.burn.push({source,tokenId});
      if(oneShot&&source===address.toLowerCase())eligibleOneShot.push(tokenId);
     }
     if(eligibleOneShot.length){
      // One-shot eligibility cannot be inferred from ownership; the simulation
      // checks the on-chain lineage and remint capacity for each candidate.
      const simulations=await Promise.allSettled(eligibleOneShot.map(tokenId=>
       client.simulateContract({address:contract,abi,functionName:'oneShotRemint',args:[BigInt(tokenId)],account:wallet as `0x${string}`})
      ));
      simulations.forEach((r,i)=>{if(r.status==='fulfilled')result.oneShot.push({tokenId:eligibleOneShot[i]});});
     }
    }
    return result;
   }));
   const errors:string[]=[];
   for(const item of sourceResults){
    if(item.status==='fulfilled'){
     methods.holder.push(...item.value.holder);
     methods.burn.push(...item.value.burn);
     methods.oneShot.push(...item.value.oneShot);
    }else errors.push(item.reason instanceof Error?item.reason.message:'Source collection unavailable');
   }
   if(errors.length)eligibilityError=`Some whitelist contracts could not be checked (${errors.length}/${sources.length}). ${errors[0]}`;
  }catch(e){eligibilityError=e instanceof Error?e.message:'Eligibility temporarily unavailable';}
 }
  // Legacy 8x8 free mint is freeMint(hoodieId), not V5 holderClaim(source,id).
  // Never infer eligibility from the uploaded build: ownership and claimed flag are on-chain.
  if(isLegacy8x8){
    let legacyError:string|null=null;
    const legacyClaims:typeof methods.holder=[];
    if(wallet){
      try{
        if(!process.env.ALCHEMY_API_KEY)throw Error('ALCHEMY_API_KEY is required to find eligible Hoodies');
        const nfts=await owned(LEGACY_HOODIE,wallet,chainId);
        const seen=new Set<string>();
        for(const nft of nfts){
          if(seen.has(nft.tokenId))continue;
          seen.add(nft.tokenId);
          const id=BigInt(nft.tokenId);
          // A failed read/simulation must not turn into a false "eligible" result.
          const [actualOwner,wasClaimed]=await Promise.all([
            client.readContract({address:LEGACY_HOODIE as `0x${string}`,abi,functionName:'ownerOf',args:[id]}),
            client.readContract({address:contract,abi:legacyAbi,functionName:'hoodieClaimed',args:[id]}),
          ]);
          if(actualOwner.toLowerCase()!==wallet.toLowerCase()||wasClaimed)continue;
          try{
            await client.simulateContract({address:contract,abi:legacyAbi,functionName:'freeMint',args:[id],account:wallet as `0x${string}`});
            legacyClaims.push({source:LEGACY_HOODIE,tokenId:nft.tokenId,priceWei:'0',remaining:1});
          }catch{/* Supply may be exhausted or mint restricted: don't offer it. */}
        }
      }catch(e){legacyError=e instanceof Error?e.message:'Legacy Hoodie eligibility unavailable';}
    }
    methods.holder=legacyClaims;
    methods.burn=[];
    methods.oneShot=[];
    // Legacy contract does not expose V5 claim/oneShot flags.
    return NextResponse.json({maxSupply:Number(max),minted,priceWei:price.toString(),remainingAllowance:null,
      features:{holder:true,burn:false,oneShot:false},methods,eligibilityError:legacyError},
      {headers:{'Cache-Control':'no-store'}});
  }
  const remainingAllowance=perWallet===BigInt(0)?null:Math.max(0,Number(perWallet-publicCount));
 return NextResponse.json({maxSupply:Number(max),minted,priceWei:price.toString(),remainingAllowance,features:{holder,burn,oneShot},methods,eligibilityError},{headers:{'Cache-Control':'no-store'}});
}
