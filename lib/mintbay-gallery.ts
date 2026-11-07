import { publicRpc, alchemyNetwork, supportedChains } from './chains';
import { decodeFunctionResult, encodeFunctionData, parseAbi, keccak256, toBytes } from 'viem';
import { unstable_cache } from 'next/cache';
export const CHAIN = 4663;
export const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
export const TOKEN = /^\d{1,40}$/;
export const API = process.env.MINTBAY_API_URL || 'https://api.mintbay.fun';
export const explorer = (a:string, chain=4663) => `${explorerBase[chain] || explorerBase[4663]}/address/${a}`;
const explorerBase:Record<number,string>={4663:'https://robin.etherscan.io',8453:'https://basescan.org',1:'https://etherscan.io',137:'https://polygonscan.com',130:'https://uniscan.xyz',42161:'https://arbiscan.io'};
const openSeaSlug:Record<number,string>={4663:'robinhood',8453:'base',1:'ethereum',137:'matic',130:'unichain',42161:'arbitrum'};
export const opensea = (a:string,id?:string,chain=4663) => `https://opensea.io/assets/${openSeaSlug[chain] || 'robinhood'}/${a}${id==null?'':'/'+id}`;
export const net = (a:string) => `https://www.netprotocol.app/app/bazaar/robinhood/${a}`;
export const collectionHref=(a:string,chain=4663)=>`/collections/${chain}/${a.toLowerCase()}`;
export const tokenHref=(a:string,id:string,chain=4663)=>`${collectionHref(a,chain)}/${id}`;
export type Collection = {chainId:number;contractAddress:string;name:string;symbol:string;maxSupply:number;mintPriceEth:string;previewImage:string|null;firstMintTokenId?:string|null; buildId?:string; deployedAt:string};
export type NFT = {contract:string;tokenId:string;name:string;image:string|null;animationUrl?:string|null;attributes:{trait_type:string;value:string}[];owner:string|null; acquiredAt?:string;chainId?:number};
export async function collections():Promise<Collection[]> {
 const r=await fetch(`${API}/v1/collections`,{next:{revalidate:90}});
 if(!r.ok)throw Error('Mintbay collections API unavailable');
 const v=await r.json(); return Array.isArray(v.collections)?v.collections.filter((c:Collection)=>supportedChains.some(chain=>chain.id===c.chainId)):[];
}
export async function collection(address:string,chain=4663):Promise<Collection|null>{return (await collections()).find(c=>c.chainId===chain&&c.contractAddress.toLowerCase()===address.toLowerCase())||null;}
const hosts=alchemyNetwork;
function alchemyUrl(chain=4663){const k=process.env.ALCHEMY_API_KEY;if(!k||!hosts[chain])return null;return `https://${hosts[chain]}.g.alchemy.com/nft/v3/${k}`;}
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
const abi=parseAbi(['function ownerOf(uint256) view returns (address)','function tokenURI(uint256) view returns (string)','function price() view returns(uint256)','function maxSupply() view returns(uint256)','function totalSupply() view returns(uint256)','function totalMinted() view returns(uint256)']);
export async function rpcCall(address: string, functionName: 'ownerOf' | 'tokenURI' | 'price' | 'maxSupply' | 'totalSupply' | 'totalMinted', args: bigint[] = [], chain=4663): Promise<string | bigint> {
 const key = process.env.ALCHEMY_API_KEY;
 const url = key && hosts[chain] ? `https://${hosts[chain]}.g.alchemy.com/v2/${key}` : publicRpc[chain];
 if (!url) throw Error('Configure ALCHEMY_API_KEY or ROBINHOOD_RPC_URL');
 const arg = args[0] ?? BigInt(0);
 const data = functionName === 'ownerOf' ? encodeFunctionData({abi,functionName:'ownerOf',args:[arg]})
  : functionName === 'tokenURI' ? encodeFunctionData({abi,functionName:'tokenURI',args:[arg]})
  : functionName === 'price' ? encodeFunctionData({abi,functionName:'price'})
  : functionName === 'maxSupply' ? encodeFunctionData({abi,functionName:'maxSupply'})
  : functionName === 'totalMinted' ? encodeFunctionData({abi,functionName:'totalMinted'})
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
 if (functionName === 'totalMinted') return decodeFunctionResult({abi,functionName:'totalMinted',data:hex});
 return decodeFunctionResult({abi,functionName:'totalSupply',data:hex});
}
function decodeTokenUri(uri: string): JsonMap | null {
 try {
  // Fully on-chain collections may use base64, URL-encoded JSON, or an
  // explicit UTF-8 data URI. Never fetch arbitrary metadata URLs here.
  const separator = uri.indexOf(',');
  if (separator < 0) return null;
  const header = uri.slice(0,separator).toLowerCase();
  if (!header.startsWith('data:application/json')) return null;
  const encoded = uri.slice(separator+1);
  const json = header.endsWith(';base64')
   ? Buffer.from(encoded,'base64').toString('utf8')
   : decodeURIComponent(encoded);
  return asObj(JSON.parse(json));
 } catch { return null; }
}
// For a token page, the contract's tokenURI is the canonical artwork source.
// Alchemy is still used for fast NFT discovery and metadata fallback.
export async function token(address:string,id:string,chain=4663):Promise<NFT|null>{
 if(!ADDRESS.test(address)||!TOKEN.test(id))return null;
 let item:NFT|null=null;
 try{item=nftOf(await alchemy('getNFTMetadata',{contractAddress:address,tokenId:id,tokenType:'ERC721'},chain),address)}catch{}
 try{
  const owner=String(await rpcCall(address,'ownerOf',[BigInt(id)],chain));
  if(!item)item={contract:address.toLowerCase(),tokenId:id,name:`#${id}`,image:null,animationUrl:null,attributes:[],owner};
  item.owner=owner;
  try{
   const raw=decodeTokenUri(String(await rpcCall(address,'tokenURI',[BigInt(id)],chain)));
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
 async (address: string, tokenId: string, chain: number) => {
  const uri = String(await rpcCall(address, 'tokenURI', [BigInt(tokenId)],chain));
  return decodeTokenUri(uri);
 },
 ['mintbay-token-artwork-v1'],
 { revalidate: 300 }
);

// The canonical Mintbay ERC721A contracts assign sequential IDs and expose the
// lifetime mint count. Read their newest tokens straight from the chain: a mint
// appears after confirmation even when the Alchemy NFT index has not caught up.
// For older contracts without totalMinted(), use the Alchemy Transfers API,
// ordered newest-first (rather than the NFT API's oldest-first startToken=0).
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MINT_PAGE_SIZE = 24;
const MINT_SCAN_LIMIT = 96; // bounded work for collections with burned tokens

async function verifiedOnChainToken(address: string, id: string, chain: number): Promise<NFT | null> {
 try {
  const owner = String(await rpcCall(address, 'ownerOf', [BigInt(id)], chain));
  const item: NFT = {
   contract: address.toLowerCase(), tokenId: id, name: `#${id}`,
   image: null, animationUrl: null, attributes: [], owner, chainId: chain,
  };
  try {
   const raw = await cachedTokenMetadata(address, id, chain);
   if (typeof raw?.image === 'string' && (/^data:image\//.test(raw.image) || /^https:\/\//.test(raw.image))) item.image = raw.image;
   if (typeof raw?.name === 'string') item.name = raw.name;
   if (typeof raw?.animation_url === 'string') item.animationUrl = raw.animation_url;
   if (Array.isArray(raw?.attributes)) item.attributes = attributesOf(raw.attributes);
  } catch { /* Some older contracts use metadata URLs instead of data URIs. */ }
  if (!item.image) {
   try {
    const indexed = nftOf(await alchemy('getNFTMetadata', {contractAddress: address, tokenId: id, tokenType: 'ERC721'}, chain), address);
    item.image = indexed.image;
    if (item.name === `#${id}`) item.name = indexed.name;
    if (!item.animationUrl) item.animationUrl = indexed.animationUrl;
    if (!item.attributes.length) item.attributes = indexed.attributes;
   } catch { /* Keep a correct token ID/owner if the indexer is behind. */ }
  }
  return item;
 } catch { return null; } // Burned, unminted or nonexistent token.
}

type MintPage = { tokens: NFT[]; next: string | null };

async function sequentialMintPage(address: string, firstId: bigint, minted: bigint, cursor: string, limit: number, chain: number): Promise<MintPage> {
 let index = cursor.startsWith('n:') ? BigInt(cursor.slice(2)) : minted - BigInt(1);
 // Do not reveal a caller-supplied position beyond the actual on-chain count.
 if (index >= minted) index = minted - BigInt(1);
 const tokens: NFT[] = [];
 let scanned = 0;
 while (index >= BigInt(0) && tokens.length < limit && scanned < MINT_SCAN_LIMIT) {
  const remaining = Math.min(6, limit - tokens.length, MINT_SCAN_LIMIT - scanned, Number(index + BigInt(1)));
  const ids = Array.from({length: remaining}, (_, i) => (firstId + index - BigInt(i)).toString());
  const batch = await Promise.all(ids.map(id => verifiedOnChainToken(address, id, chain)));
  for (const token of batch) if (token) tokens.push(token);
  scanned += remaining;
  index -= BigInt(remaining);
 }
 return {tokens, next: index >= BigInt(0) ? `n:${index}` : null};
}

function parseMintTokenId(value: unknown): string | null {
 if (typeof value !== 'string' || !/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) return null;
 try { return BigInt(value).toString(); } catch { return null; }
}

async function legacyMintPage(address: string, cursor: string, limit: number, chain: number): Promise<MintPage> {
 const key = process.env.ALCHEMY_API_KEY;
 const host = hosts[chain];
 if (!key || !host) throw Error('Alchemy mint history is unavailable for this legacy collection.');
 const params: Record<string, unknown> = {
  fromAddress: ZERO_ADDRESS, contractAddresses: [address], category: ['erc721'],
  order: 'desc', excludeZeroValue: false, withMetadata: false,
  maxCount: `0x${limit.toString(16)}`,
 };
 if (cursor.startsWith('a:')) params.pageKey = cursor.slice(2);
 const response = await fetch(`https://${host}.g.alchemy.com/v2/${key}`, {
  method: 'POST', headers: {'content-type':'application/json'},
  body: JSON.stringify({jsonrpc:'2.0',id:1,method:'alchemy_getAssetTransfers',params:[params]}),
  cache:'no-store',signal:AbortSignal.timeout(12000),
 });
 const payload: unknown = await response.json();
 const result = at(payload, 'result');
 const transfers = at(result, 'transfers');
 if (!response.ok || at(payload, 'error') || !Array.isArray(transfers)) {
  throw Error('Unable to retrieve the latest on-chain mints from Alchemy.');
 }
 const ids = [...new Set(transfers.map(t => parseMintTokenId(at(t, 'erc721TokenId') ?? at(t, 'tokenId'))).filter((v): v is string => v !== null))];
 const tokenResults: (NFT | null)[] = [];
 for (let i = 0; i < ids.length; i += 6) {
  tokenResults.push(...await Promise.all(ids.slice(i,i+6).map(id => verifiedOnChainToken(address, id, chain))));
 }
 const pageKey = at(result, 'pageKey');
 return {
  tokens: tokenResults.filter((t): t is NFT => t !== null),
  next: typeof pageKey === 'string' && pageKey ? `a:${pageKey}` : null,
 };
}

export async function collectionTokens(address: string, cursor='0', limit=MINT_PAGE_SIZE, _fresh=false, chain=4663): Promise<MintPage> {
 if (!ADDRESS.test(address) || !supportedChains.some(c => c.id === chain)) throw Error('Invalid collection or chain');
 // Cursors are intentionally tied to their source; a legacy page cannot be
 // mistaken for a sequential on-chain page when index support changes.
 if (cursor.startsWith('a:')) return legacyMintPage(address,cursor,limit,chain);
 const isSequential = cursor.startsWith('n:');
 let lifetime: bigint | null = null;
 if (!cursor || cursor === '0' || isSequential) {
  try {
   const [count, circulating] = await Promise.all([
    rpcCall(address, 'totalMinted', [], chain),
    rpcCall(address, 'totalSupply', [], chain).catch(() => null),
   ]);
   // Do not trust a counter that disagrees with circulating ownership.
   if (circulating === null || BigInt(count) >= BigInt(circulating)) lifetime = BigInt(count);
  } catch { /* Old contract */ }
 }
 if (lifetime !== null) {
  const c = await collection(address, chain);
  const configuredStart = c?.firstMintTokenId;
  const firstId = configuredStart && /^(0x[0-9a-fA-F]+|\d+)$/.test(configuredStart) ? BigInt(configuredStart) : BigInt(0);
  return sequentialMintPage(address, firstId, lifetime, cursor, limit, chain);
 }
 if (isSequential) throw Error('Lifetime mint counter unavailable. Refresh the gallery.');
 return legacyMintPage(address,cursor,limit,chain);
}

// Explicitly read every page before claiming a latest-16 export. Errors propagate, never silently truncate.
export async function ownerTokens(owner:string):Promise<NFT[]>{
 const registered=await collections();const contracts=registered.map(c=>({address:c.contractAddress,chain:c.chainId}));
 if(!contracts.length)return [];
 const all:NFT[]=[];
 for(const chain of supportedChains){
  const chainContracts=contracts.filter(c=>c.chain===chain.id).map(c=>c.address);
  for(let batch=0;batch<chainContracts.length;batch+=45){
   const b=chainContracts.slice(batch,batch+45);let pageKey:string|undefined;let pages=0;
   do{
    if(++pages>100)throw Error('Gallery too large to fully load; try again later');
    const params:Record<string,string>={owner,withMetadata:'true',pageSize:'100',orderBy:'transferTime'};
    b.forEach((a,i)=>params[`contractAddresses[${i}]`]=a);
    if(pageKey)params.pageKey=pageKey;
    const d=await alchemy('getNFTsForOwner',params,chain.id,true);
    if(!Array.isArray(at(d,'ownedNfts')))throw Error('Unexpected NFT ownership response');
    all.push(...asArray(at(d,'ownedNfts')).map((v:unknown)=>({...nftOf(v),chainId:chain.id})));
    pageKey=asText(at(d,'pageKey')) || undefined;
   }while(pageKey);
  }
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
async function checkMintStatus(address:string,chain=4663):Promise<'minted_out'|'unknown'> {
 const key=process.env.ALCHEMY_API_KEY;
 const url=key&&hosts[chain]?`https://${hosts[chain]}.g.alchemy.com/v2/${key}`:publicRpc[chain];
 if(!url)return 'unknown';
 try{
  const p=BigInt(await rpcCall(address,'price',[],chain));
  const max=BigInt(await rpcCall(address,'maxSupply',[],chain));
  const live=BigInt(await rpcCall(address,'totalSupply',[],chain));
  if(live>=max)return 'minted_out';
  const encoded=encodeFunctionData({abi:parseAbi(['function mint(uint256) payable']),functionName:'mint',args:[BigInt(1)]});
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:address,from:'0xb316e8ea7bc9b24ea5fd4ebd07051678c27ffe79',data:encoded,value:'0x'+p.toString(16)},'latest']}) ,cache:'no-store'});
  const body=await res.json();
  const serialized=JSON.stringify(body.error||{}).toLowerCase();
  if(serialized.includes(MAX_SUPPLY_ERROR))return 'minted_out';
  return 'unknown'; // could be open; avoid asserting it if simulation fails
 }catch{return 'unknown'}
}
export async function mintStatus(address:string,chain=4663){return unstable_cache(()=>checkMintStatus(address,chain),['mint-status-v53',String(chain),address.toLowerCase()],{revalidate:21600})()}

// Truthful collection-grid badges. Prefer the lifetime on-chain counter; for
// legacy collections, confirm exhaustion via circulating supply or a simulated
// mint, never via an unreliable current owner count alone.
export type CollectionMintSummary = { soldOut: boolean; minted: number | null; maxSupply: number };
export async function collectionMintSummary(entry: Collection): Promise<CollectionMintSummary> {
 const address = entry.contractAddress;
 const chain = entry.chainId;
 return unstable_cache(async (): Promise<CollectionMintSummary> => {
  const [maxResult, lifetimeResult, circulatingResult] = await Promise.allSettled([
   rpcCall(address,'maxSupply',[],chain),
   rpcCall(address,'totalMinted',[],chain),
   rpcCall(address,'totalSupply',[],chain),
  ]);
  const max = maxResult.status === 'fulfilled' ? BigInt(maxResult.value) : null;
  const cap = max === null || max > BigInt(Number.MAX_SAFE_INTEGER) ? entry.maxSupply : Number(max);
  if (max === null || max <= BigInt(0)) return {soldOut:false,minted:null,maxSupply:cap};
  if (lifetimeResult.status === 'fulfilled') {
   const lifetime = BigInt(lifetimeResult.value);
   if (circulatingResult.status !== 'fulfilled' || lifetime >= BigInt(circulatingResult.value)) {
    return {soldOut:lifetime >= max,minted:lifetime <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(lifetime) : null,maxSupply:cap};
   }
  }
  if (circulatingResult.status === 'fulfilled' && BigInt(circulatingResult.value) >= max) {
   return {soldOut:true,minted:null,maxSupply:cap};
  }
  return {soldOut:await checkMintStatus(address,chain) === 'minted_out',minted:null,maxSupply:cap};
 }, ['mintbay-grid-supply-v1',String(chain),address.toLowerCase()], {revalidate:60})();
}
