'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { formatEther, parseAbi, parseEther } from 'viem';
import { WalletConnect } from '@/components/wallet-connect';

import { chainNames, supportedChains } from '@/lib/chains';
// Transaction gas ceilings. Wallet fee presets remain wallet-controlled.
const SINGLE_MINT_GAS = BigInt(2500000);
const publicMintGasLimit = (quantity:number) => {
 const estimated = BigInt(quantity) * BigInt(850000) + BigInt(300000);
 return estimated > SINGLE_MINT_GAS ? estimated : SINGLE_MINT_GAS;
};
const LEGACY_8X8 = '0x2ee6305804dd94f7ff695c5ab1f3ae805f317653';
const abi = parseAbi([
  'function totalMinted() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function price() view returns (uint256)',
  'function mint(uint256 quantity) payable',
  'function freeMint(uint256 hoodieId)',
  'function holderClaim(address sourceContract, uint256 sourceTokenId) payable',
  'function burnAndClaim(address sourceCollection, uint256 sourceTokenId) payable',
  'function oneShotRemint(uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner,address operator) view returns (bool)',
  'function approve(address spender,uint256 tokenId)',
]);
type Claim = {source:string;tokenId:string;priceWei:string;remaining:number};
type Burn = {source:string;tokenId:string};
type OneShot = {tokenId:string};
type Preview = {image:string|null;name:string};
type Option = Claim | Burn | OneShot;
const hasSource = (o: Option): o is Claim | Burn => 'source' in o;
const hasPrice = (o: Option): o is Claim => 'priceWei' in o;
const optionKey = (o: Option, address: string) => `${hasSource(o) ? o.source.toLowerCase() : address.toLowerCase()}:${o.tokenId}`;
type SupplySource='totalMinted'|'alchemy'|'totalSupply'|'unknown';
type SupplyData={maxSupply:number;minted:number|null;circulating?:number|null;supplySource?:SupplySource;maxSupplyVerified?:boolean;priceWei:string;priceVerified?:boolean};
type Eligibility=SupplyData&{remainingAllowance:number|null;features:{holder:boolean;burn:boolean;oneShot:boolean};methods:{holder:Claim[];burn:Burn[];oneShot:OneShot[]};eligibilityError:string|null};
// On newer contracts, totalMinted() counts burns too. Legacy deployments may
// only have totalSupply(), which represents circulating rather than lifetime mints.
type LiveSupply={lifetime:bigint|null;circulating:bigint|null;maxSupply:bigint|null;priceWei:bigint|null};
type Props={chainId:number;address:string;fallbackPrice:string;maxSupply:number;status?:'open'|'minted_out'|'unknown';openseaUrl?:string};
const short=(a:string)=>`${a.slice(0,6)}…${a.slice(-4)}`;
// Deterministic across Node.js SSR and browsers (no runtime-dependent locale).
const formatCount=(value:number)=>String(value).replace(/\B(?=(\d{3})+(?!\d))/g,'.');

export function MintWidget(props:Props){
 const {address:wallet,isConnected}=useAccount();
 return <MintWidgetSession key={`${props.chainId}:${props.address.toLowerCase()}:${wallet?.toLowerCase()||'disconnected'}`} {...props} wallet={wallet} isConnected={isConnected}/>;
}
function MintWidgetSession({chainId,address,fallbackPrice,maxSupply,wallet,isConnected,status='unknown',openseaUrl}:Props&{wallet:`0x${string}`|undefined;isConnected:boolean}){
 const contract=address as `0x${string}`;
 const isLegacy8x8 = chainId===4663 && address.toLowerCase() === LEGACY_8X8;
 const activeChain=useChainId();
 const {switchChain}=useSwitchChain();
 const client=usePublicClient({chainId});
 const {writeContractAsync}=useWriteContract();
 const [data,setData]=useState<Eligibility|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState('');
 const [success,setSuccess]=useState('');
 const [qty,setQty]=useState(1);
 const [tab,setTab]=useState<'public'|'holder'|'burn'|'oneShot'>('public');
 const [selected,setSelected]=useState('');
 const [consumed,setConsumed]=useState<Record<string,Option>>({});
 const [oneShotPreviews,setOneShotPreviews]=useState<Record<string,Preview>>({});
 // Cache loaded preview IDs without making each thumbnail update restart the effect.
 const previewLoadedIds=useRef<Set<string>>(new Set());
 const [refresh,setRefresh]=useState(0);
 const [liveSupply,setLiveSupply]=useState<LiveSupply|null>(null);
 const [liveSupplyLoading,setLiveSupplyLoading]=useState(true);
 const [apiSupply,setApiSupply]=useState<SupplyData|null>(null);
 // Prefer the current contract's lifetime count, but never assume that older
 // Mintbay / legacy 8x8 contracts implement it. Read each method independently.
 useEffect(()=>{
  if(!client)return;
  let canceled=false;
  async function checkSupply(){
   if(!client)return;
   const [lifetime,circulating,cap,priceWei]=await Promise.all([
    client.readContract({address:contract,abi,functionName:'totalMinted'}).catch(()=>null),
    client.readContract({address:contract,abi,functionName:'totalSupply'}).catch(()=>null),
    client.readContract({address:contract,abi,functionName:'maxSupply'}).catch(()=>null),
    client.readContract({address:contract,abi,functionName:'price'}).catch(()=>null),
   ]);
   if(!canceled){
    setLiveSupply(lifetime!==null||circulating!==null||cap!==null||priceWei!==null?{lifetime,circulating,maxSupply:cap,priceWei}:null);
    setLiveSupplyLoading(false);
   }
  }
  void checkSupply();
  const interval=setInterval(()=>void checkSupply(),15000);
  return()=>{canceled=true;clearInterval(interval);};
 },[client,contract,refresh]);
 useEffect(()=>{
  const abort=new AbortController();
  fetch(`/api/mintbay/mint-options/${address}?${new URLSearchParams({...wallet?{wallet}:{},chainId:String(chainId)})}`,{signal:abort.signal,cache:'no-store'})
   .then(async r=>{const json:unknown=await r.json();if(!r.ok)throw Error('Unable to check mint options');return json as Eligibility;})
   .then(value=>{if(!abort.signal.aborted){setData(value);setApiSupply(value);setLoading(false);}})
   .catch(()=>{if(!abort.signal.aborted){setError('Mint options temporarily unavailable.');setLoading(false);}});
  return()=>abort.abort();
 },[address,wallet,chainId,refresh]);
 // Legacy deployments need indexer-based lifetime counts, so also refresh the
 // lightweight supply-only route. The full route's NFT eligibility scans are
 // intentionally NOT rerun every 30 seconds.
 const hasDirectLifetime=liveSupply?.lifetime!==null&&liveSupply?.lifetime!==undefined;
 useEffect(()=>{
  if(hasDirectLifetime)return;
  const controller=new AbortController();
  let pending=false;
  async function refreshSupply(){
   if(pending||controller.signal.aborted)return;
   pending=true;
   try{
    const q=new URLSearchParams({chainId:String(chainId),supplyOnly:'1'});
    const response=await fetch(`/api/mintbay/mint-options/${address}?${q}`,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw Error('Supply refresh failed');
    const next=await response.json() as SupplyData;
    if(!controller.signal.aborted)setApiSupply(next);
   }catch{/* Retain the last successful reading and retry on the next poll. */}
   finally{pending=false;}
  }
  const interval=setInterval(()=>void refreshSupply(),30000);
  return()=>{controller.abort();clearInterval(interval);};
 },[address,chainId,hasDirectLifetime]);
 const backend=apiSupply??data;
 const apiHasLifetime=backend?.minted!=null && (backend.supplySource==='totalMinted'||backend.supplySource==='alchemy'||backend.supplySource===undefined);
 const lifetime=hasDirectLifetime?Number(liveSupply!.lifetime):apiHasLifetime?backend!.minted:null;
 const circulating=liveSupply?.circulating!==null&&liveSupply?.circulating!==undefined
  ? Number(liveSupply.circulating)
  : backend?.circulating??(backend?.supplySource==='totalSupply'?backend.minted:null);
 const cap=liveSupply?.maxSupply!==null&&liveSupply?.maxSupply!==undefined?Number(liveSupply.maxSupply):(backend?.maxSupply??maxSupply);
 const minted=lifetime??circulating;
 const supplyIsCirculating=lifetime===null&&circulating!==null;
 const remain=minted===null?null:Math.max(0,cap-minted);
 const pct=minted===null||cap===0?null:Math.min(100,minted/cap*100);
 // The parent status is only a fallback; direct lifetime readings always win.
 const soldOut=lifetime!==null?lifetime>=cap:(minted!==null&&minted>=cap)||status==='minted_out';
 const supplyUnknown=minted===null&&!soldOut;
 const supplyChecking=supplyUnknown&&Boolean(client)&&liveSupplyLoading;
 const price=liveSupply?.priceWei??(backend?.priceWei && backend.priceVerified!==false?BigInt(backend.priceWei):parseEther(fallbackPrice));
 const allowance=data?.remainingAllowance??null;
 const maxQty=soldOut||supplyUnknown?0:Math.max(0,Math.min(20,remain??20,allowance??20));
 const quantity=Math.min(qty,Math.max(1,maxQty));
 const liveOptions=tab==='holder' ? (data?.methods.holder??[]) : tab==='burn' ? (data?.methods.burn??[]) : (data?.methods.oneShot??[]);
 // Keys include both the source contract and token ID, so #12 on two different
 // whitelist contracts remains two independent entries. Tabs are isolated too.
 const usedKey=(kind:'holder'|'burn'|'oneShot',o:Option)=>`${kind}:${optionKey(o,address)}`;
 const options=liveOptions.filter(o=>!consumed[usedKey(tab==='public'?'holder':tab,o)]);
 const claimedOptions=Object.entries(consumed)
  .filter(([key])=>key.startsWith(`${tab}:`))
  .map(([,option])=>option);
 // Load artwork ONLY for One Shot: these NFTs will be permanently burned.
 // Holder Claim and Burn & Claim remain ID-only and make zero image requests.
 const oneShotIds=(data?.methods.oneShot??[]).map(o=>o.tokenId).join(',');
 useEffect(()=>{
  if(tab!=='oneShot'||!oneShotIds)return;
  const controller=new AbortController();
  const ids=oneShotIds.split(',');
  // Limited concurrency protects the RPC and keeps the wallet picker responsive.
  async function load(){
   let next=0;
   const workers=Array.from({length:Math.min(4,ids.length)},async()=>{
    while(next<ids.length&&!controller.signal.aborted){
     const tokenId=ids[next++];
     const key=`${address.toLowerCase()}:${tokenId}`;
     if(previewLoadedIds.current.has(key))continue;
     try{
      const q=new URLSearchParams({source:address,tokenId,chainId:String(chainId)});
      const response=await fetch(`/api/mintbay/mint-preview?${q}`,{signal:controller.signal});
      if(!response.ok)throw Error('Preview unavailable');
      const result:unknown=await response.json();
      const record=result&&typeof result==='object'?result as Record<string,unknown>:{};
      const preview:Preview={image:typeof record.image==='string'?record.image:null,name:typeof record.name==='string'?record.name:`#${tokenId}`};
       if(!controller.signal.aborted){
        previewLoadedIds.current.add(key);
        setOneShotPreviews(previous=>({...previous,[key]:preview}));
       }
     }catch{
       if(!controller.signal.aborted){
        previewLoadedIds.current.add(key);
        setOneShotPreviews(previous=>({...previous,[key]:{image:null,name:`#${tokenId}`}}));
       }
     }
    }
   });
   await Promise.all(workers);
  }
  void load();
  return()=>controller.abort();
 // A ref stores loaded IDs so each thumbnail update does not restart this queue.
 },[tab,oneShotIds,address,chainId]);
 const chosen=options.find(t=>optionKey(t,address)===selected);
 const requestedGasLimit = tab==='public' ? publicMintGasLimit(quantity) : SINGLE_MINT_GAS;
 const sourceGroups=Array.from(new Set([...options,...claimedOptions].map(o=>hasSource(o)?o.source.toLowerCase():address.toLowerCase())));
 const availableCounts={
  holder:(data?.methods.holder??[]).filter(o=>!consumed[usedKey('holder',o)]).length,
  burn:(data?.methods.burn??[]).filter(o=>!consumed[usedKey('burn',o)]).length,
  oneShot:(data?.methods.oneShot??[]).filter(o=>!consumed[usedKey('oneShot',o)]).length,
 };
 async function perform(){
  if(!wallet||!client||busy||activeChain!==chainId)return;
  setError('');setSuccess('');setBusy('Checking live supply');
  try{
   if(soldOut)throw Error('This collection is minted out.');
   if(supplyUnknown)throw Error('Unable to verify current supply. Please refresh.');
   // Re-read on-chain just before acting. A legacy contract may not expose
   // totalMinted(), so use transaction simulation before the wallet prompt.
   const [latestLifetime,latestCirculating,latestMax,latestPrice]=await Promise.all([
    client.readContract({address:contract,abi,functionName:'totalMinted'}).catch(()=>null),
    client.readContract({address:contract,abi,functionName:'totalSupply'}).catch(()=>null),
    client.readContract({address:contract,abi,functionName:'maxSupply'}).catch(()=>null),
    client.readContract({address:contract,abi,functionName:'price'}).catch(()=>null),
   ]);
   const currentPublicPrice=latestPrice??price;
   const currentMax=latestMax??BigInt(cap);
   if(latestLifetime!==null||latestCirculating!==null){
    setLiveSupply({lifetime:latestLifetime,circulating:latestCirculating,maxSupply:latestMax,priceWei:latestPrice});
   }
   // Never replace a known lifetime count with a lower circulating count.
   const fallbackCount=lifetime!==null?BigInt(lifetime):minted!==null?BigInt(minted):null;
   const currentCount=latestLifetime??(latestCirculating!==null
    ? (fallbackCount!==null&&fallbackCount>latestCirculating?fallbackCount:latestCirculating)
    : fallbackCount);
   if(currentCount!==null&&currentCount>=currentMax)throw Error('This collection is minted out.');
   if(tab==='public'&&currentCount!==null&&BigInt(quantity)>currentMax-currentCount){
    throw Error(`Only ${(currentMax-currentCount).toString()} mint slots remain.`);
   }
   // Verified V5.1/V6 capacity requires both lifetime and cap on-chain.
   // Without that combination, simulate the selected legacy method so an
   // unknown lifetime count never becomes a blind wallet transaction.
   const mustSimulate=latestLifetime===null||latestMax===null;
   async function simulateOrExplain(action:()=>Promise<unknown>){
    try{await action();}
    catch(e){
     const details=e instanceof Error?e.message.slice(0,140):'';
     throw Error(`Mint preflight failed; collection may be minted out or this action is ineligible. ${details}`);
    }
   }
   let hash:`0x${string}`;
   if(tab==='public'){
    if(maxQty===0)throw Error('No public mints remaining for this wallet.');
    setBusy('Confirm mint in wallet');
    // Pixel-art minting may run multiple trait-selection attempts per NFT.
    // Apply a conservative floor for single mints, scaling for larger quantities.
    // This is a gas ceiling, not a guarantee that a reverting transaction will succeed.
    const publicGas = publicMintGasLimit(quantity);
    if(mustSimulate)await simulateOrExplain(()=>client.simulateContract({address:contract,abi,functionName:'mint',args:[BigInt(quantity)],value:currentPublicPrice*BigInt(quantity),gas:publicGas,account:wallet}));
    hash=await writeContractAsync({address:contract,abi,functionName:'mint',args:[BigInt(quantity)],value:currentPublicPrice*BigInt(quantity),gas:publicGas,chainId});
   }else if(tab==='holder'){
    if(!chosen||!hasPrice(chosen))throw Error('Choose an eligible NFT.');
    setBusy('Confirm claim in wallet');
    if(mustSimulate){
     if(isLegacy8x8)await simulateOrExplain(()=>client.simulateContract({address:contract,abi,functionName:'freeMint',args:[BigInt(chosen.tokenId)],gas:SINGLE_MINT_GAS,account:wallet}));
     else await simulateOrExplain(()=>client.simulateContract({address:contract,abi,functionName:'holderClaim',args:[chosen.source as `0x${string}`,BigInt(chosen.tokenId)],value:BigInt(chosen.priceWei),gas:SINGLE_MINT_GAS,account:wallet}));
    }
    hash=isLegacy8x8
      ? await writeContractAsync({address:contract,abi,functionName:'freeMint',args:[BigInt(chosen.tokenId)],gas:SINGLE_MINT_GAS,chainId})
      : await writeContractAsync({address:contract,abi,functionName:'holderClaim',args:[chosen.source as `0x${string}`,BigInt(chosen.tokenId)],value:BigInt(chosen.priceWei),gas:SINGLE_MINT_GAS,chainId});
   }else if(tab==='burn'){
    if(!chosen||!hasSource(chosen))throw Error('Choose an eligible NFT to burn.');
    const original=chosen.source as `0x${string}`;
    const id=BigInt(chosen.tokenId);
    const [approved,allApproved]=await Promise.all([
     client.readContract({address:original,abi,functionName:'getApproved',args:[id]}),
     client.readContract({address:original,abi,functionName:'isApprovedForAll',args:[wallet,contract]})
    ]);
    if(approved.toLowerCase()!==address.toLowerCase()&&!allApproved){
     setBusy('Approve the selected NFT');
     const approval=await writeContractAsync({address:original,abi,functionName:'approve',args:[contract,id],chainId});
     const receipt=await client.waitForTransactionReceipt({hash:approval});
     if(receipt.status!=='success')throw Error('NFT approval failed');
    }
    setBusy('Confirm permanent burn and claim');
    if(mustSimulate)await simulateOrExplain(()=>client.simulateContract({address:contract,abi,functionName:'burnAndClaim',args:[original,id],value:BigInt(0),gas:SINGLE_MINT_GAS,account:wallet}));
    hash=await writeContractAsync({address:contract,abi,functionName:'burnAndClaim',args:[original,id],value:BigInt(0),gas:SINGLE_MINT_GAS,chainId});
   }else{
    if(!chosen)throw Error('Choose an eligible NFT.');
    setBusy('Confirm One Shot in wallet');
    if(mustSimulate)await simulateOrExplain(()=>client.simulateContract({address:contract,abi,functionName:'oneShotRemint',args:[BigInt(chosen.tokenId)],gas:SINGLE_MINT_GAS,account:wallet}));
    hash=await writeContractAsync({address:contract,abi,functionName:'oneShotRemint',args:[BigInt(chosen.tokenId)],gas:SINGLE_MINT_GAS,chainId});
   }
   setBusy('Waiting for confirmation');
   const receipt=await client.waitForTransactionReceipt({hash});
   if(receipt.status!=='success')throw Error('Transaction reverted');
   // Only disable holder IDs whose claim allowance is now exhausted.
   // If claimsPerToken > 1, the same NFT remains available for further claims.
   if(chosen && tab!=='public' && (tab!=='holder' || (hasPrice(chosen) && chosen.remaining<=1))){
    const key=usedKey(tab,chosen);
    setConsumed(previous=>({
     ...previous,
     [key]:chosen,
     // Burning a source NFT also invalidates a holder claim for that NFT.
     ...(tab==='burn'?{[usedKey('holder',chosen)]:chosen}:{}),
    }));
   }
   // Reset loading from this event handler, never synchronously in an effect.
   setLoading(true);setLiveSupplyLoading(Boolean(client));
   setSuccess(hash);setRefresh(n=>n+1);setSelected('');
  }catch(e){setError(e instanceof Error?e.message:'Transaction failed');}finally{setBusy('');}
 }
 // OpenSea accepts chain + contract URLs and redirects to the matching collection.
 // A caller can optionally pass the canonical collection link as openseaUrl.
 const openSeaChains:Record<number,string>={1:'ethereum',10:'optimism',130:'unichain',137:'matic',42161:'arbitrum',8453:'base',4663:'robinhood'};
 const secondaryUrl=openseaUrl || `https://opensea.io/assets/${openSeaChains[chainId]??'ethereum'}/${address}`;

 // Sold-out collections are display-only: no wallet connection, mint tabs,
 // eligibility refresh, gas controls, or disabled mint buttons.
 if(soldOut){
  return <div className="mb-mint">
   <div style={{marginBottom:28}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
     <strong>{minted!==null?`${formatCount(minted)} / ${formatCount(cap)} ${supplyIsCirculating?'CIRCULATING':'MINTED'}`:`${formatCount(cap)} MAX SUPPLY`}</strong>
     <span>{pct!==null?`${pct.toFixed(1)}%`:'100%'}</span>
    </div>
    <div role="progressbar" aria-label="NFT mint progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct??100} style={{height:12,border:'2px solid #151515',background:'#e7e7e3',marginTop:9,overflow:'hidden'}}>
     <div style={{height:'100%',width:`${pct??100}%`,background:'#caff45'}}/>
    </div>
   </div>
   <div role="status" style={{textAlign:'center',padding:'12px 0 28px'}}>
    <div style={{fontWeight:900,fontSize:28,lineHeight:1.1}}>MINTED OUT</div>
    <p style={{margin:'12px 0 0',fontWeight:700,fontSize:13}}>ALL {formatCount(cap)} MINT SLOTS USED.</p>
   </div>
   <a href={secondaryUrl} target="_blank" rel="noopener noreferrer" className="btn btn-lime" style={{display:'block',width:'100%',boxSizing:'border-box',textAlign:'center',textDecoration:'none',padding:'15px 16px',fontWeight:900}}>
    BUY ON SECONDARY ↗
   </a>
  </div>;
 }
 const labels:{[K in typeof tab]:string}={public:'PUBLIC MINT',holder:'HOLDER CLAIM',burn:'BURN & CLAIM',oneShot:'ONE SHOT'};
 return <div className="mb-mint">
  <div style={{marginBottom:20}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong>{minted!==null&&minted!==undefined?`${formatCount(minted)} / ${formatCount(cap)} ${supplyIsCirculating?'CIRCULATING':'MINTED'}`:`${formatCount(cap)} MAX SUPPLY`}</strong><span>{pct!==null?`${pct.toFixed(1)}%`:'—'}</span></div>
   <div role="progressbar" aria-label="NFT mint progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct??undefined} style={{height:12,border:'2px solid #151515',background:'#e7e7e3',marginTop:9,overflow:'hidden'}}>{pct!==null&&<div style={{height:'100%',width:`${pct}%`,background:'#caff45'}}/>}</div>
   </div>
   {soldOut&&<p role="status" style={{fontWeight:900,margin:'0 0 14px'}}>MINTED OUT — ALL {formatCount(cap)} MINT SLOTS USED.</p>}
   {supplyUnknown&&<p role="status" style={{fontWeight:700,margin:'0 0 14px'}}>{supplyChecking?'CHECKING LIVE SUPPLY…':'CANNOT VERIFY SUPPLY. REFRESH TO TRY AGAIN.'}</p>}
   {supplyIsCirculating&&!soldOut&&<p role="status" style={{fontSize:12,margin:'0 0 14px'}}>SUPPLY FALLBACK: SHOWING CIRCULATING NFTs. BURNED MINT SLOTS MAY NOT BE INCLUDED; AVAILABILITY IS SIMULATED BEFORE MINTING.</p>}
   {!isConnected?<><div className="mb-price">{formatEther(price)} {chainId===137?'POL':'ETH'} <small>PER NFT</small></div><WalletConnect/></>:<>
   {loading?<p>CHECKING YOUR MINT OPTIONS…</p>:<>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:18}}>
     {(['public','holder','burn','oneShot'] as const).filter(k=>k==='public'||Boolean(data?.features[k])).map(k=><button key={k} type="button" onClick={()=>{setTab(k);setSelected('');setError('');}} style={{padding:'8px 11px',border:'2px solid #151515',font:'inherit',fontWeight:800,cursor:'pointer',background:tab===k?'#caff45':'transparent'}}>{labels[k]}{k!=='public'&&data?` (${availableCounts[k]})`:''}</button>)}
    </div>
    {tab==='public'?<>
     <div className="mb-price">{formatEther(price)} {chainId===137?'POL':'ETH'} <small>PER NFT</small></div>
     {allowance!==null&&<p>YOU CAN MINT {Math.min(allowance,remain??allowance)} MORE</p>}
     <label>QUANTITY <input type="number" min={1} max={Math.max(1,maxQty)} value={quantity} disabled={maxQty===0||soldOut||supplyUnknown} onChange={e=>setQty(Math.max(1,Math.min(20,Number(e.target.value)||1)))}/></label>
     <strong>TOTAL: {formatEther(price*BigInt(quantity))} {chainId===137?'POL':'ETH'} + GAS</strong>
    </>:<>
     {options.length===0 && claimedOptions.length===0 ?
      <p>{data?.eligibilityError?'UNABLE TO VERIFY ELIGIBILITY RIGHT NOW.':'NO ELIGIBLE NFTs FOUND IN THIS WALLET.'}</p>:
      <div style={{marginBottom:14}}>
       <strong style={{display:'block',marginBottom:10}}>CHOOSE NFT ID</strong>
       <div aria-label="Available NFT IDs" role="region" tabIndex={0} style={{maxHeight:300,overflowY:'auto',overscrollBehavior:'contain',border:'1px solid #151515',padding:'12px',scrollbarGutter:'stable'}}>
       {sourceGroups.map(source=>{
        const matching=(o:Option)=>(hasSource(o)?o.source.toLowerCase():address.toLowerCase())===source;
        const entries=[...options.filter(matching).map(o=>({o,disabled:false})),...claimedOptions.filter(matching).map(o=>({o,disabled:true}))];
        return <div key={source} style={{marginBottom:16}}>
         <div style={{fontSize:11,fontWeight:800,overflowWrap:'anywhere',marginBottom:7}}>
          {tab==='oneShot'?'THIS COLLECTION':'WHITELIST CONTRACT'} · {source}
         </div>
         <div style={tab==='oneShot'
          ? {display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))',gap:10}
          : {display:'flex',flexWrap:'wrap',gap:7}}>
          {entries.map(({o,disabled})=>{
           const key=optionKey(o,address);
           const picked=!disabled && selected===key;
           const preview=tab==='oneShot'?oneShotPreviews[key]:undefined;
           return <button key={`${key}:${disabled?'used':'ready'}`} type="button" disabled={disabled||Boolean(busy)}
            aria-pressed={picked} aria-label={`Token #${o.tokenId}${disabled?' (used)':''}`}
            title={disabled?'Already used':`Select #${o.tokenId}`}
            onClick={()=>setSelected(key)}
            style={{border:picked?'2px solid #151515':'1px solid #151515',borderRadius:0,padding:tab==='oneShot'?5:'8px 12px',background:picked?'#caff45':'#f7f7f1',color:'#151515',cursor:disabled?'not-allowed':'pointer',font:'inherit',fontWeight:800,fontSize:13,opacity:disabled?0.3:1,minWidth:tab==='oneShot'?0:65,textAlign:tab==='oneShot'?'left':'center'}}>
            {tab==='oneShot'&&<span style={{display:'block',position:'relative',aspectRatio:'1',background:'#e8e8e3',overflow:'hidden'}}>
             {preview?.image?<Image src={preview.image} alt={`NFT #${o.tokenId} to burn`} fill unoptimized sizes="120px" style={{objectFit:'contain',imageRendering:'pixelated'}}/>:
              <span style={{display:'flex',height:'100%',alignItems:'center',justifyContent:'center',fontSize:11}}>{preview?'NO IMAGE':'LOADING…'}</span>}
            </span>}
            <span style={{display:'block',marginTop:tab==='oneShot'?5:0}}>#{o.tokenId}{disabled?' ✓':''}</span>
           </button>;
          })}
         </div>
        </div>;
       })}
       </div>
       {chosen&&<p style={{marginTop:10,fontSize:12}}>SELECTED NFT #{chosen.tokenId}{hasSource(chosen)?` · ${short(chosen.source)}`:''}{hasPrice(chosen)?` · ${formatEther(BigInt(chosen.priceWei))} ETH`:''}</p>}
       {tab==='burn'&&chosen&&<p style={{fontSize:12,fontWeight:800,marginBottom:14}}>BURNING #{chosen.tokenId} PERMANENTLY DESTROYS THIS NFT.</p>}
       {tab==='oneShot'&&chosen&&<p style={{fontSize:12,fontWeight:800}}>ONE SHOT PERMANENTLY BURNS #{chosen.tokenId} AND MINTS ITS REPLACEMENT.</p>}
      </div>
     }
    </>}
    {data?.eligibilityError&&<p role="status">SOME ELIGIBILITY CHECKS COULD NOT COMPLETE. TRY REFRESHING.</p>}
    <p style={{fontSize:11,opacity:0.7,margin:'8px 0'}}>MINTBAY REQUESTED GAS LIMIT: {formatCount(Number(requestedGasLimit))} · NETWORK FEE SET BY WALLET. VERIFY GAS LIMIT IN METAMASK BEFORE CONFIRMING.</p>
    {activeChain!==chainId?<button className="btn btn-lime" onClick={()=>switchChain?.({chainId})}>SWITCH TO {chainNames[chainId] || chainId}</button>:<button className="btn btn-lime" disabled={Boolean(busy)||!client||soldOut||supplyUnknown||(tab==='public'&&maxQty===0)||(tab!=='public'&&!chosen)} onClick={()=>void perform()}>{soldOut?'MINTED OUT':supplyUnknown?(supplyChecking?'CHECKING SUPPLY…':'SUPPLY UNAVAILABLE'):busy?`${busy.toUpperCase()}…`:tab==='public'?'MINT NOW ↗':tab==='holder'?(isLegacy8x8?'CLAIM FREE PORTRAIT ↗':'CLAIM NOW ↗'):tab==='burn'?'BURN & CLAIM ↗':'ONE SHOT ↗'}</button>}
   </>}
  </>}
  {success&&<p role="status">CONFIRMED! <a href={`${supportedChains.find(c=>c.id===chainId)?.blockExplorers?.default.url || 'https://robin.etherscan.io'}/tx/${success}`} target="_blank" rel="noreferrer">VIEW TRANSACTION ↗</a></p>}
  {error&&<p role="alert" style={{overflowWrap:'anywhere'}}>{error.slice(0,300)}</p>}
  {isConnected&&<button type="button" onClick={()=>{setLoading(true);setLiveSupplyLoading(Boolean(client));setRefresh(n=>n+1);setError('');}} style={{display:'block',background:'none',border:0,padding:'12px 0 0',font:'inherit',cursor:'pointer',textDecoration:'underline'}}>REFRESH ELIGIBILITY ↗</button>}
 </div>;
}
