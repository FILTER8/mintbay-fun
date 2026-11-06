import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, encodeAbiParameters, keccak256, isAddress, parseAbiItem } from 'viem';
import { supportedChains, publicRpc, alchemyNetwork } from '@/lib/chains';
import { collection } from '@/lib/mintbay-gallery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const API = process.env.MINTBAY_API_URL || 'https://api.mintbay.fun';
const ZERO = '0x0000000000000000000000000000000000000000' as const;
// One legacy collection, no change to V5.1 collections.
const LEGACY_8X8 = '0x2ee6305804dd94f7ff695c5ab1f3ae805f317653';
// These three entries are written directly by the HoodiePunks X BankrBot
// constructor and therefore have NO ApprovedClaimCollectionSet logs.
// Never use this fallback for unrelated Mintbay collections.
const HOODIEPUNKS_INITIAL_SOURCES = [
 '0x9Ec6C5b9f572A9B02138E553BC5F5882Da735F45',
 '0x2eE6305804dD94F7ff695C5Ab1f3AE805f317653',
 '0xC8E36aE47246e5943da2B228fbAff1Fb27a473B0',
];
const CLAIM_SET_EVENT = parseAbiItem('event ApprovedClaimCollectionSet(address indexed collection, bool approved, uint256 priceEth)');
const BURN_SET_EVENT = parseAbiItem('event BurnClaimCollectionSet(address indexed sourceCollection, bool approved)');
const LEGACY_HOODIE = '0x9Ec6C5b9f572A9B02138E553BC5F5882Da735F45';
const legacyAbi = parseAbi([
  'function hoodieClaimed(uint256) view returns (bool)',
  'function freeMint(uint256)',
]);
const abi = parseAbi([
  'function maxSupply() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  // V5.1/V6 lifetime counter: burns do not reopen mint slots.
  'function totalMinted() view returns (uint256)',
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
const uniqueAddresses=(values:string[])=>Array.from(new Set(values.filter((value):value is `0x${string}`=>isAddress(value)).map(a=>a.toLowerCase())));

// getLogs is attempted against the complete history, not just the last N blocks.
// Alchemy Free currently restricts eth_getLogs block ranges on several chains.
// If it rejects a full-history scan, we expose that limitation instead of
// incorrectly claiming that newly added whitelists do not exist.
async function discoverEvents(client:ReturnType<typeof getClient>, contract:`0x${string}`, enabled:boolean, event:typeof CLAIM_SET_EVENT | typeof BURN_SET_EVENT):Promise<{sources:string[];error:string|null}>{
 if(!enabled)return {sources:[],error:null};
 try{
  const rawFrom=process.env.MINTBAY_WHITELIST_FROM_BLOCK;
  // Optional optimization: set this to the earliest Mintbay deployment block.
  const fromBlock=rawFrom && /^\d+$/.test(rawFrom)?BigInt(rawFrom):BigInt(0);
  const logs=await client.getLogs({address:contract,event,fromBlock,toBlock:'latest'});
  const sources=logs.map(log=>'collection' in log.args ? log.args.collection : ('sourceCollection' in log.args ? log.args.sourceCollection : undefined))
   .filter((v):v is `0x${string}`=>typeof v==='string'&&isAddress(v));
  return {sources:uniqueAddresses(sources),error:null};
 }catch(e){
  console.warn('[mint-options] whitelist log scan unavailable',e);
  return {sources:[],error:'Live whitelist event discovery is unavailable on this RPC plan. Initial configured sources are still verified on-chain.'};
 }
}

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
// Newer Mintbay contracts expose a lifetime counter. Older collections may only
// expose circulating totalSupply(), so use historical mint transfers where possible.
// Never silently treat an RPC failure as zero mints.
type SupplySource = 'totalMinted' | 'alchemy' | 'totalSupply' | 'unknown';
type MintSupply = {
 maxSupply:number;
 minted:number|null;
 circulating:number|null;
 supplySource:SupplySource;
 maxSupplyVerified:boolean;
 priceWei:string;
 priceVerified:boolean;
};
async function resolveMintSupply(client:ReturnType<typeof getClient>,contract:`0x${string}`,configuredMaxSupply:number,chainId:number):Promise<MintSupply>{
 const [onChainMax,onChainLifetime,onChainCirculating,onChainPrice]=await Promise.all([
  safeRead<bigint|null>(client,contract,'maxSupply',[],null),
  safeRead<bigint|null>(client,contract,'totalMinted',[],null),
  safeRead<bigint|null>(client,contract,'totalSupply',[],null),
  safeRead<bigint|null>(client,contract,'price',[],null),
 ]);
 const maxSupply=Number(onChainMax??BigInt(configuredMaxSupply));
 const circulating=onChainCirculating===null?null:Number(onChainCirculating);
 let minted:number|null=null;
 let supplySource:SupplySource='unknown';
 if(onChainLifetime!==null && (onChainCirculating===null || onChainLifetime>=onChainCirculating)){
  // Canonical V5.1/V6 source. Accurate even after burns/One Shot remints.
  minted=Number(onChainLifetime);
  supplySource='totalMinted';
 }else{
  // Legacy path: Alchemy tracks mint transfers from the zero address.
  // Only use it when the result is complete and not below circulating supply.
  const transferCount=await lifetimeMinted(contract,maxSupply,chainId);
  if(transferCount!==null && (circulating===null || transferCount>=circulating)){
   minted=transferCount;
   supplySource='alchemy';
  }else if(circulating!==null){
   // Circulating supply alone cannot detect burned mint slots. The client
   // displays this as CIRCULATING, and simulates before an uncertain mint.
   minted=circulating;
   supplySource='totalSupply';
  }
 }
 return {
  maxSupply,minted,circulating,supplySource,
  maxSupplyVerified:onChainMax!==null,
  priceWei:(onChainPrice??BigInt(0)).toString(),
  priceVerified:onChainPrice!==null,
 };
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
  if(p===4)throw Error('Wallet holds more than 500 NFTs in a source collection; pagination is incomplete');
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
  const isLegacy8x8=chainId===4663 && address.toLowerCase()===LEGACY_8X8;
 const wallet=request.nextUrl.searchParams.get('wallet')||'';
 if(wallet && !isAddress(wallet))return NextResponse.json({error:'Invalid wallet'},{status:400});
 // Lightweight polling endpoint: do not rescan holder wallets just to refresh supply.
 if(request.nextUrl.searchParams.get('supplyOnly')==='1'){
  const supply=await resolveMintSupply(client,contract,c.maxSupply,chainId);
  return NextResponse.json(supply,{headers:{'Cache-Control':'no-store'}});
 }
 const [supply,buildRes,publicCount,perWallet,holder,burn,oneShot,claimPerToken]=await Promise.all([
  resolveMintSupply(client,contract,c.maxSupply,chainId),
  fetch(`${API}/v1/builds/${(c as typeof c & {buildId?:string}).buildId}/config`,{next:{revalidate:600}}).then(r=>r.ok?r.json():null).catch(()=>null),
  wallet?safeRead(client,contract,'publicMintsCount',[wallet],BigInt(0)):Promise.resolve(BigInt(0)),
  safeRead(client,contract,'maxMintsPerWallet',[],BigInt(0)),
  safeRead(client,contract,'holderClaimEnabled',[],false),
  safeRead(client,contract,'burnClaimEnabled',[],false),
  safeRead(client,contract,'oneShotEnabled',[],false),
  safeRead(client,contract,'claimsPerToken',[],BigInt(0))
 ]);
 // Read the schema of the immutable Studio build. V6 and V5.1 use the same
 // Holder Claim contract ABI, but store feature configuration under different keys.
 const buildConfig=obj(buildRes);
 const v6=obj(get(buildConfig,'mintbayV6'));
 const v5=obj(get(buildConfig,'mintbayV5'));
 const features=Number(get(v6,'schemaVersion'))===6 ? v6 : v5;
 const configuredHolder=holder?asSources(get(get(features,'holderClaim'),'sourceCollections')):[];
 const configuredBurn=burn?asSources(get(get(features,'burnAndClaim'),'sourceCollections')):[];
 const initialHolder=c.name.trim().toLowerCase()==='hoodiepunks x bankrbot' && chainId===4663
   ? HOODIEPUNKS_INITIAL_SOURCES:[];
 // Never depend only on the build JSON: the contract can change after deploy.
 const [holderEvents,burnEvents]=await Promise.all([
   discoverEvents(client,contract,Boolean(wallet)&&holder&&!isLegacy8x8,CLAIM_SET_EVENT),
   discoverEvents(client,contract,Boolean(wallet)&&burn&&!isLegacy8x8,BURN_SET_EVENT),
 ]);
 const holderSources=uniqueAddresses([...configuredHolder,...initialHolder,...holderEvents.sources]);
 const burnSources=uniqueAddresses([...configuredBurn,...burnEvents.sources]);
 const methods:{holder:Array<{source:string;tokenId:string;priceWei:string;remaining:number}>; burn:Array<{source:string;tokenId:string}>;oneShot:Array<{tokenId:string}>}={holder:[],burn:[],oneShot:[]};
 let eligibilityError:string|null=[holderEvents.error,burnEvents.error].filter(Boolean).join(' ')||null;
 if(wallet && !isLegacy8x8){
  if(!process.env.ALCHEMY_API_KEY || !alchemyNetwork[chainId]){
   eligibilityError='Alchemy NFT API is required to discover wallet token IDs.';
  }else{
   const sources=uniqueAddresses([...holderSources,...burnSources,...(oneShot?[address]:[])]);
   // A single failed source must not hide eligibility for the other sources.
   const results=await Promise.allSettled(sources.map(async source=>{
    const target=source as `0x${string}`;
    const [holderSettings,burnApproved]=await Promise.all([
     holder&&holderSources.includes(source)
       ?client.readContract({address:contract,abi,functionName:'approvedClaimCollections',args:[target]})
       :Promise.resolve([false,BigInt(0)] as const),
     burn&&burnSources.includes(source)
       ?client.readContract({address:contract,abi,functionName:'approvedBurnClaimCollections',args:[target]})
       :Promise.resolve(false),
    ]);
    if(!holderSettings[0]&&!burnApproved&&!(oneShot&&source===address.toLowerCase()))return {holder:[],burn:[],oneShot:[]};
    const nfts=await owned(source,wallet,chainId);
    const ids=Array.from(new Set(nfts.map(n=>n.tokenId))); 
    const checked:PromiseSettledResult<{holder?:{source:string;tokenId:string;priceWei:string;remaining:number};burn?:{source:string;tokenId:string};oneShot?:{tokenId:string}}|null>[]=[];
    for(let start=0;start<ids.length;start+=12){
      const batch=ids.slice(start,start+12);
      const items=await Promise.allSettled(batch.map(async tokenId=>{
     const id=BigInt(tokenId);
     // Ownership and claim state remain authoritative on the destination/source contracts.
     const actualOwner=await client.readContract({address:target,abi,functionName:'ownerOf',args:[id]});
     if(actualOwner.toLowerCase()!==wallet.toLowerCase())return null;
     const eligible:{holder?:{source:string;tokenId:string;priceWei:string;remaining:number};burn?:{source:string;tokenId:string};oneShot?:{tokenId:string}}={};
     if(holderSettings[0]){
      const claimKey=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[target,id]));
      const used=await client.readContract({address:contract,abi,functionName:'claimsUsed',args:[claimKey]});
      const left=claimPerToken-used;
      if(left>BigInt(0))eligible.holder={source,tokenId,priceWei:holderSettings[1].toString(),remaining:Number(left)};
     }
     if(burnApproved)eligible.burn={source,tokenId};
     if(oneShot&&source===address.toLowerCase()){
      try{await client.simulateContract({address:contract,abi,functionName:'oneShotRemint',args:[id],account:wallet as `0x${string}`});eligible.oneShot={tokenId};}catch{}
     }
     return eligible;
      }));
      checked.push(...items);
    }
    const local={holder:[] as typeof methods.holder,burn:[] as typeof methods.burn,oneShot:[] as typeof methods.oneShot};
    for(const item of checked){
     if(item.status==='rejected')throw item.reason;
     if(item.value?.holder)local.holder.push(item.value.holder);
     if(item.value?.burn)local.burn.push(item.value.burn);
     if(item.value?.oneShot)local.oneShot.push(item.value.oneShot);
    }
    return local;
   }));
   for(const result of results){
    if(result.status==='fulfilled'){
     methods.holder.push(...result.value.holder);
     methods.burn.push(...result.value.burn);
     methods.oneShot.push(...result.value.oneShot);
    }else{
     console.warn('[mint-options] source eligibility failure',result.reason);
     eligibilityError=[eligibilityError,'Some whitelist ownership/claim checks could not complete.'].filter(Boolean).join(' ');
    }
   }
  }
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
    return NextResponse.json({...supply,remainingAllowance:null,
      features:{holder:true,burn:false,oneShot:false},methods,eligibilityError:legacyError},
      {headers:{'Cache-Control':'no-store'}});
  }
  const remainingAllowance=perWallet===BigInt(0)?null:Math.max(0,Number(perWallet-publicCount));
 return NextResponse.json({...supply,remainingAllowance,features:{holder,burn,oneShot},methods,eligibilityError},{headers:{'Cache-Control':'no-store'}});
}
