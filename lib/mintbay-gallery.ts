import { decodeFunctionResult, encodeFunctionData, parseAbi, keccak256, toBytes } from 'viem';
import { unstable_cache } from 'next/cache';
export const CHAIN = 4663;
export const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
export const TOKEN = /^\d{1,40}$/;
export const API = process.env.MINTBAY_API_URL || 'https://api.mintbay.fun';
export const explorer = (a:string) => `https://robin.etherscan.io/address/${a}`;
export const opensea = (a:string,id?:string) => `https://opensea.io/assets/robinhood/${a}${id==null?'':'/'+id}`;
export const net = (a:string) => `https://www.netprotocol.app/app/bazaar/robinhood/${a}`;
export const collectionHref=(a:string)=>`/collections/4663/${a.toLowerCase()}`;
export const tokenHref=(a:string,id:string)=>`${collectionHref(a)}/${id}`;
export type Collection = {chainId:number;contractAddress:string;name:string;symbol:string;maxSupply:number;mintPriceEth:string;previewImage:string|null;firstMintTokenId?:string|null; deployedAt:string};
export type NFT = {contract:string;tokenId:string;name:string;image:string|null;animationUrl?:string|null;attributes:{trait_type:string;value:string}[];owner:string|null; acquiredAt?:string};
export async function collections():Promise<Collection[]> {
 const r=await fetch(`${API}/v1/collections`,{next:{revalidate:90}});
 if(!r.ok)throw Error('Mintbay collections API unavailable');
 const v=await r.json(); return Array.isArray(v.collections)?v.collections.filter((c:Collection)=>c.chainId===4663):[];
}
export async function collection(address:string):Promise<Collection|null>{return (await collections()).find(c=>c.contractAddress.toLowerCase()===address.toLowerCase())||null;}
const hosts:Record<number,string>={4663:'robinhood-mainnet',8453:'base-mainnet',1:'eth-mainnet'};
function alchemyUrl(chain=4663){const k=process.env.ALCHEMY_API_KEY;if(!k)return null;return `https://${hosts[chain]}.g.alchemy.com/nft/v3/${k}`;}
async function alchemy(method:string,params:Record<string,string>,chain=4663,fresh=false){const base=alchemyUrl(chain);if(!base)throw Error('ALCHEMY_API_KEY must be configured on server');const q=new URLSearchParams();for(const [k,v] of Object.entries(params))q.append(k.startsWith('contractAddresses[')?'contractAddresses[]':k,v);const r=await fetch(`${base}/${method}?${q}`,fresh?{cache:'no-store'}:{next:{revalidate:90}});if(!r.ok)throw Error(`Alchemy NFT API: ${r.status} (${method})`);return r.json();}
type JsonMap = Record<string, unknown>;
const asObj = (v: unknown): JsonMap => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as JsonMap : {});
const asArray = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const asText = (v: unknown): string | undefined => typeof v === 'string' ? v : undefined;
function at(v: unknown, ...path: string[]): unknown {
 let current: unknown = v;
 for (const key of path) current = asObj(current)[key];
 return current;
}
function attributesOf(v: unknown): NFT['attributes'] {
 return asArray(v).flatMap((entry) => {
  const e = asObj(entry);
  const key = asText(e.trait_type);
  const value = e.value;
  return key && (typeof value === 'string' || typeof value === 'number')
   ? [{ trait_type: key, value: String(value) }] : [];
 });
}
function imageOf(o: unknown): string | null {
 const candidates = [at(o,'raw','metadata','image'),at(o,'metadata','image'),at(o,'image','originalUrl'),at(o,'image','pngUrl'),at(o,'image','cachedUrl'),at(o,'image')];
 return candidates.find((v): v is string => typeof v === 'string' && (/^https:\/\//.test(v) || /^data:image\//.test(v))) ?? null;
}
function nftOf(o: unknown, contract?: string): NFT {
 const addr = contract || asText(at(o,'contract','address')) || asText(at(o,'contractAddress')) || '';
 const id = String(at(o,'tokenId') ?? at(o,'id','tokenId') ?? '');
 const owners = asArray(at(o,'owners'));
 return {
  contract:addr.toLowerCase(), tokenId:id,
  name:asText(at(o,'name')) || asText(at(o,'raw','metadata','name')) || asText(at(o,'metadata','name')) || `#${id}`,
  image:imageOf(o),
   animationUrl:asText(at(o,'raw','metadata','animation_url')) || asText(at(o,'metadata','animation_url')) || asText(at(o,'animationUrl')) || null,
  attributes:attributesOf(at(o,'raw','metadata','attributes') ?? at(o,'metadata','attributes')),
  owner:asText(owners[0]) ?? null,
  acquiredAt:asText(at(o,'acquiredAt','blockTimestamp')) || asText(at(o,'mint','timestamp')) || asText(at(o,'timeLastUpdated')),
 };
}
const abi=parseAbi(['function ownerOf(uint256) view returns (address)','function tokenURI(uint256) view returns (string)','function price() view returns(uint256)','function maxSupply() view returns(uint256)','function totalSupply() view returns(uint256)']);
export async function rpcCall(address: string, functionName: 'ownerOf' | 'tokenURI' | 'price' | 'maxSupply' | 'totalSupply', args: bigint[] = []): Promise<string | bigint> {
 const key = process.env.ALCHEMY_API_KEY;
 const url = key ? `https://robinhood-mainnet.g.alchemy.com/v2/${key}` : process.env.ROBINHOOD_RPC_URL;
 if (!url) throw Error('Configure ALCHEMY_API_KEY or ROBINHOOD_RPC_URL');
 const arg = args[0] ?? BigInt(0);
 const data = functionName === 'ownerOf' ? encodeFunctionData({abi,functionName:'ownerOf',args:[arg]})
  : functionName === 'tokenURI' ? encodeFunctionData({abi,functionName:'tokenURI',args:[arg]})
  : functionName === 'price' ? encodeFunctionData({abi,functionName:'price'})
  : functionName === 'maxSupply' ? encodeFunctionData({abi,functionName:'maxSupply'})
  : encodeFunctionData({abi,functionName:'totalSupply'});
 const response = await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:address,data},'latest']}),cache:'no-store'});
 const body: unknown = await response.json();
 const result = asText(at(body,'result'));
 if (!response.ok || at(body,'error') || !result) throw Error('Contract read failed');
 const hex = result as `0x${string}`;
 if (functionName === 'ownerOf') return decodeFunctionResult({abi,functionName:'ownerOf',data:hex});
 if (functionName === 'tokenURI') return decodeFunctionResult({abi,functionName:'tokenURI',data:hex});
 if (functionName === 'price') return decodeFunctionResult({abi,functionName:'price',data:hex});
 if (functionName === 'maxSupply') return decodeFunctionResult({abi,functionName:'maxSupply',data:hex});
 return decodeFunctionResult({abi,functionName:'totalSupply',data:hex});
}
function decodeTokenUri(uri: string): JsonMap | null {
 try {
  if (uri.startsWith('data:application/json;base64,')) return asObj(JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8')));
  if (uri.startsWith('data:application/json,')) return asObj(JSON.parse(decodeURIComponent(uri.slice(uri.indexOf(',')+1))));
 } catch { /* Unsupported or malformed metadata */ }
 return null;
}
// For a token page, the contract's tokenURI is the canonical artwork source.
// Alchemy is still used for fast NFT discovery and metadata fallback.
export async function token(address:string,id:string):Promise<NFT|null>{
 if(!ADDRESS.test(address)||!TOKEN.test(id))return null;
 let item:NFT|null=null;
 try{item=nftOf(await alchemy('getNFTMetadata',{contractAddress:address,tokenId:id,tokenType:'ERC721'}),address)}catch{}
 try{
  const owner=String(await rpcCall(address,'ownerOf',[BigInt(id)]));
  if(!item)item={contract:address.toLowerCase(),tokenId:id,name:`#${id}`,image:null,animationUrl:null,attributes:[],owner};
  item.owner=owner;
  try{
   const raw=decodeTokenUri(String(await rpcCall(address,'tokenURI',[BigInt(id)])));
   if(typeof raw?.image==='string' && (/^data:image\//.test(raw.image)||/^https:\/\//.test(raw.image)))item.image=raw.image;
   if(typeof raw?.name==='string')item.name=raw.name;
    if(typeof raw?.animation_url==='string')item.animationUrl=raw.animation_url;
   if(Array.isArray(raw?.attributes))item.attributes=attributesOf(raw.attributes);
  }catch{/* retain Alchemy metadata if tokenURI fetch temporarily fails */}
  return item;
 }catch{return null;} // ownerOf reverts for burned / never-minted tokens
}
// Cache image metadata only; ownership is always verified separately on chain.
const cachedTokenMetadata = unstable_cache(
 async (address: string, tokenId: string) => {
  const uri = String(await rpcCall(address, 'tokenURI', [BigInt(tokenId)]));
  return decodeTokenUri(uri);
 },
 ['mintbay-token-artwork-v1'],
 { revalidate: 300 }
);

export async function collectionTokens(address:string,startToken='0',limit=24,fresh=false):Promise<{tokens:NFT[];next:string|null}>{
 const data=await alchemy('getNFTsForCollection',{contractAddress:address,withMetadata:'true',startToken,limit:String(limit)},4663,fresh);
 const items=asArray(at(data,'nfts'));
 // A token might still be present in Alchemy metadata after a burn. Verify ownerOf.
 // This page is limited to 24 items, and checks run concurrently with a cap.
 const filtered:NFT[]=[];
 for(let i=0;i<items.length;i+=6){
  const batch=await Promise.all(items.slice(i,i+6).map(async(o:unknown)=>{
   const n=nftOf(o,address);
   try{
    n.owner=String(await rpcCall(address,'ownerOf',[BigInt(n.tokenId)]));
    // Always prefer the immutable on-chain SVG rather than an Alchemy thumbnail.
    // Two bounded RPC reads per visible token, not a continuous indexer scan.
    try{
     const raw=await cachedTokenMetadata(address,n.tokenId);
     if(typeof raw?.image==='string' && (/^data:image\//.test(raw.image)||/^https:\/\//.test(raw.image)))n.image=raw.image;
     if(typeof raw?.name==='string')n.name=raw.name;
      if(typeof raw?.animation_url==='string')n.animationUrl=raw.animation_url;
     if(Array.isArray(raw?.attributes))n.attributes=attributesOf(raw.attributes);
    }catch{/* keep raw Alchemy metadata as fallback */}
    return n;
   }catch{return null;} // Exclude burned and unminted NFTs
  }));
  for(const v of batch)if(v)filtered.push(v);
 }
 return {tokens:filtered,next:asText(at(data,'nextToken')) ?? null};
}
// Explicitly read every page before claiming a latest-16 export. Errors propagate, never silently truncate.
export async function ownerTokens(owner:string):Promise<NFT[]>{
 const registered=await collections();const contracts=registered.map(c=>c.contractAddress);
 if(!contracts.length)return [];
 const all:NFT[]=[];
 for(let batch=0;batch<contracts.length;batch+=45){
  const b=contracts.slice(batch,batch+45);let pageKey:string|undefined;let pages=0;
  do{
   if(++pages>100)throw Error('Gallery too large to fully load; try again later');
   const params:Record<string,string>={owner,withMetadata:'true',pageSize:'100',orderBy:'transferTime'};
   b.forEach((a,i)=>params[`contractAddresses[${i}]`]=a);
   if(pageKey)params.pageKey=pageKey;
   const d=await alchemy('getNFTsForOwner',params,4663,true);
   if (!Array.isArray(at(d,'ownedNfts'))) throw Error('Unexpected NFT ownership response');
   all.push(...asArray(at(d,'ownedNfts')).map((v:unknown)=>nftOf(v)));
   pageKey=asText(at(d,'pageKey')) || undefined;
  }while(pageKey);
 }
 // Sort newest ownership transfer first; never compare token IDs across collections as a date.
 // Alchemy orderBy=transferTime returns newest-first pages; prefer timestamp when present.
 all.sort((a,b)=>{
  const ta=Date.parse(a.acquiredAt||'');
  const tb=Date.parse(b.acquiredAt||'');
  const aValid=Number.isFinite(ta), bValid=Number.isFinite(tb);
  if(aValid && bValid) return tb-ta;
  if(aValid !== bValid) return aValid ? -1 : 1;
  return 0; // Preserve indexer transfer-time order if timestamp is unavailable.
 });
 return all;
}

// 6h server-side cached status. A dry-run mint discovers lifetime-supply exhaustion
// even when burned NFTs make totalSupply smaller than historical mints.
// Do not treat unrelated errors (funds, wallet limit, RPC) as sold out.
const MAX_SUPPLY_ERROR=keccak256(toBytes('MaxSupplyExceeded()')).slice(0,10).toLowerCase();
async function checkMintStatus(address:string):Promise<'minted_out'|'unknown'> {
 const key=process.env.ALCHEMY_API_KEY;
 const url=key?`https://robinhood-mainnet.g.alchemy.com/v2/${key}`:process.env.ROBINHOOD_RPC_URL;
 if(!url)return 'unknown';
 try{
  const p=BigInt(await rpcCall(address,'price'));
  const max=BigInt(await rpcCall(address,'maxSupply'));
  const live=BigInt(await rpcCall(address,'totalSupply'));
  if(live>=max)return 'minted_out';
  const encoded=encodeFunctionData({abi:parseAbi(['function mint(uint256) payable']),functionName:'mint',args:[BigInt(1)]});
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:address,from:'0xb316e8ea7bc9b24ea5fd4ebd07051678c27ffe79',data:encoded,value:'0x'+p.toString(16)},'latest']}) ,cache:'no-store'});
  const body=await res.json();
  const serialized=JSON.stringify(body.error||{}).toLowerCase();
  if(serialized.includes(MAX_SUPPLY_ERROR))return 'minted_out';
  return 'unknown'; // could be open; avoid asserting it if simulation fails
 }catch{return 'unknown'}
}
export async function mintStatus(address:string){return unstable_cache(()=>checkMintStatus(address),['mint-status-v52',address.toLowerCase()],{revalidate:21600})()}
