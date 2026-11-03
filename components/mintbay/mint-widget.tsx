'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { formatEther, parseAbi, parseEther } from 'viem';
import { WalletConnect } from '@/components/wallet-connect';

import { chainNames, supportedChains } from '@/lib/chains';
const LEGACY_8X8 = '0x2ee6305804dd94f7ff695c5ab1f3ae805f317653';
const abi = parseAbi([
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
type Eligibility={maxSupply:number;minted:number|null;priceWei:string;remainingAllowance:number|null;features:{holder:boolean;burn:boolean;oneShot:boolean};methods:{holder:Claim[];burn:Burn[];oneShot:OneShot[]};eligibilityError:string|null};
type Props={chainId:number;address:string;fallbackPrice:string;maxSupply:number;status?:'open'|'minted_out'|'unknown'};
const short=(a:string)=>`${a.slice(0,6)}…${a.slice(-4)}`;
// Deterministic across Node.js SSR and browsers (no runtime-dependent locale).
const formatCount=(value:number)=>String(value).replace(/\B(?=(\d{3})+(?!\d))/g,'.');

export function MintWidget(props:Props){
 const {address:wallet,isConnected}=useAccount();
 return <MintWidgetSession key={`${props.chainId}:${props.address.toLowerCase()}:${wallet?.toLowerCase()||'disconnected'}`} {...props} wallet={wallet} isConnected={isConnected}/>;
}
function MintWidgetSession({chainId,address,fallbackPrice,maxSupply,wallet,isConnected,status='unknown'}:Props&{wallet:`0x${string}`|undefined;isConnected:boolean}){
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
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();
  fetch(`/api/mintbay/mint-options/${address}?${new URLSearchParams({...wallet?{wallet}:{},chainId:String(chainId)})}`,{signal:abort.signal,cache:'no-store'})
   .then(async r=>{const json:unknown=await r.json();if(!r.ok)throw Error('Unable to check mint options');return json as Eligibility;})
   .then(value=>{if(!abort.signal.aborted){setData(value);setLoading(false);}})
   .catch(()=>{if(!abort.signal.aborted){setError('Mint options temporarily unavailable.');setLoading(false);}});
  return()=>abort.abort();
 },[address,wallet,refresh]);
 const price=data?BigInt(data.priceWei):parseEther(fallbackPrice);
 const cap=data?.maxSupply??maxSupply;
 const minted=data?.minted;
 const remain=minted===null||minted===undefined?null:Math.max(0,cap-minted);
 const pct=minted===null||minted===undefined||cap===0?null:Math.min(100,minted/cap*100);
 const allowance=data?.remainingAllowance??null;
 const maxQty=Math.max(0,Math.min(20,remain??20,allowance??20));
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
     if(oneShotPreviews[key])continue;
     try{
      const q=new URLSearchParams({source:address,tokenId,chainId:String(chainId)});
      const response=await fetch(`/api/mintbay/mint-preview?${q}`,{signal:controller.signal});
      if(!response.ok)throw Error('Preview unavailable');
      const result:unknown=await response.json();
      const record=result&&typeof result==='object'?result as Record<string,unknown>:{};
      const preview:Preview={image:typeof record.image==='string'?record.image:null,name:typeof record.name==='string'?record.name:`#${tokenId}`};
      if(!controller.signal.aborted)setOneShotPreviews(previous=>({...previous,[key]:preview}));
     }catch{
      if(!controller.signal.aborted)setOneShotPreviews(previous=>({...previous,[key]:{image:null,name:`#${tokenId}`}}));
     }
    }
   });
   await Promise.all(workers);
  }
  void load();
  return()=>controller.abort();
 // Preview state is intentionally excluded: loading one thumbnail must not restart the queue.
 },[tab,oneShotIds,address,chainId]);
 const chosen=options.find(t=>optionKey(t,address)===selected);
 const sourceGroups=Array.from(new Set([...options,...claimedOptions].map(o=>hasSource(o)?o.source.toLowerCase():address.toLowerCase())));
 const availableCounts={
  holder:(data?.methods.holder??[]).filter(o=>!consumed[usedKey('holder',o)]).length,
  burn:(data?.methods.burn??[]).filter(o=>!consumed[usedKey('burn',o)]).length,
  oneShot:(data?.methods.oneShot??[]).filter(o=>!consumed[usedKey('oneShot',o)]).length,
 };
 async function perform(){
  if(!wallet||!client||busy||activeChain!==chainId)return;
  setError('');setSuccess('');
  try{
   let hash:`0x${string}`;
   if(tab==='public'){
    if(maxQty===0)throw Error('No public mints remaining for this wallet.');
    setBusy('Confirm mint in wallet');
    hash=await writeContractAsync({address:contract,abi,functionName:'mint',args:[BigInt(quantity)],value:price*BigInt(quantity),chainId});
   }else if(tab==='holder'){
    if(!chosen||!hasPrice(chosen))throw Error('Choose an eligible NFT.');
    setBusy('Confirm claim in wallet');
    hash=isLegacy8x8
      ? await writeContractAsync({address:contract,abi,functionName:'freeMint',args:[BigInt(chosen.tokenId)],chainId})
      : await writeContractAsync({address:contract,abi,functionName:'holderClaim',args:[chosen.source as `0x${string}`,BigInt(chosen.tokenId)],value:BigInt(chosen.priceWei),chainId});
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
    hash=await writeContractAsync({address:contract,abi,functionName:'burnAndClaim',args:[original,id],value:BigInt(0),chainId});
   }else{
    if(!chosen)throw Error('Choose an eligible NFT.');
    setBusy('Confirm One Shot in wallet');
    hash=await writeContractAsync({address:contract,abi,functionName:'oneShotRemint',args:[BigInt(chosen.tokenId)],chainId});
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
   setSuccess(hash);setRefresh(n=>n+1);setSelected('');
  }catch(e){setError(e instanceof Error?e.message:'Transaction failed');}finally{setBusy('');}
 }
 const labels:{[K in typeof tab]:string}={public:'PUBLIC MINT',holder:'HOLDER CLAIM',burn:'BURN & CLAIM',oneShot:'ONE SHOT'};
 return <div className="mb-mint">
  <div style={{marginBottom:20}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong>{minted!==null&&minted!==undefined?`${formatCount(minted)} / ${formatCount(cap)} MINTED`:`${formatCount(cap)} MAX SUPPLY`}</strong><span>{pct!==null?`${pct.toFixed(1)}%`:'—'}</span></div>
   <div role="progressbar" aria-label="NFT mint progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct??undefined} style={{height:12,border:'2px solid #151515',background:'#e7e7e3',marginTop:9,overflow:'hidden'}}>{pct!==null&&<div style={{height:'100%',width:`${pct}%`,background:'#caff45'}}/>}</div>
  </div>
  {!isConnected?<><div className="mb-price">{formatEther(price)} {chainId===137?'POL':'ETH'} <small>PER NFT</small></div><WalletConnect/></>:<>
   {loading?<p>CHECKING YOUR MINT OPTIONS…</p>:<>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:18}}>
     {(['public','holder','burn','oneShot'] as const).filter(k=>k==='public'||Boolean(data?.features[k])).map(k=><button key={k} type="button" onClick={()=>{setTab(k);setSelected('');setError('');}} style={{padding:'8px 11px',border:'2px solid #151515',font:'inherit',fontWeight:800,cursor:'pointer',background:tab===k?'#caff45':'transparent'}}>{labels[k]}{k!=='public'&&data?` (${availableCounts[k]})`:''}</button>)}
    </div>
    {tab==='public'?<>
     <div className="mb-price">{formatEther(price)} {chainId===137?'POL':'ETH'} <small>PER NFT</small></div>
     {allowance!==null&&<p>YOU CAN MINT {Math.min(allowance,remain??allowance)} MORE</p>}
     <label>QUANTITY <input type="number" min={1} max={Math.max(1,maxQty)} value={quantity} disabled={maxQty===0} onChange={e=>setQty(Math.max(1,Math.min(20,Number(e.target.value)||1)))}/></label>
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
    {activeChain!==chainId?<button className="btn btn-lime" onClick={()=>switchChain?.({chainId})}>SWITCH TO {chainNames[chainId] || chainId}</button>:<button className="btn btn-lime" disabled={Boolean(busy)||!client||(tab==='public'&&(maxQty===0||status==='minted_out'||remain===0))||(tab!=='public'&&!chosen)} onClick={()=>void perform()}>{busy?`${busy.toUpperCase()}…`:tab==='public'?'MINT NOW ↗':tab==='holder'?(isLegacy8x8?'CLAIM FREE PORTRAIT ↗':'CLAIM NOW ↗'):tab==='burn'?'BURN & CLAIM ↗':'ONE SHOT ↗'}</button>}
   </>}
  </>}
  {success&&<p role="status">CONFIRMED! <a href={`${supportedChains.find(c=>c.id===chainId)?.blockExplorers?.default.url || 'https://robin.etherscan.io'}/tx/${success}`} target="_blank" rel="noreferrer">VIEW TRANSACTION ↗</a></p>}
  {error&&<p role="alert" style={{overflowWrap:'anywhere'}}>{error.slice(0,300)}</p>}
  {isConnected&&<button type="button" onClick={()=>{setRefresh(n=>n+1);setError('');}} style={{display:'block',background:'none',border:0,padding:'12px 0 0',font:'inherit',cursor:'pointer',textDecoration:'underline'}}>REFRESH ELIGIBILITY ↗</button>}
 </div>;
}
