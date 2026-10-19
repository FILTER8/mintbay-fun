'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { formatEther, parseAbi, parseEther } from 'viem';
import { WalletConnect } from '@/components/wallet-connect';

const chainId = 4663;
const abi = parseAbi([
  'function mint(uint256 quantity) payable',
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
type Option = Claim | Burn | OneShot;
const hasSource = (o: Option): o is Claim | Burn => 'source' in o;
const hasPrice = (o: Option): o is Claim => 'priceWei' in o;
const optionKey = (o: Option, address: string) => `${hasSource(o) ? o.source.toLowerCase() : address.toLowerCase()}:${o.tokenId}`;
type Preview = {image:string|null;name:string};
type Eligibility={maxSupply:number;minted:number|null;priceWei:string;remainingAllowance:number|null;features:{holder:boolean;burn:boolean;oneShot:boolean};methods:{holder:Claim[];burn:Burn[];oneShot:OneShot[]};eligibilityError:string|null};
type Props={address:string;fallbackPrice:string;maxSupply:number;status?:'open'|'minted_out'|'unknown'};
const short=(a:string)=>`${a.slice(0,6)}…${a.slice(-4)}`;

export function MintWidget(props:Props){
 const {address:wallet,isConnected}=useAccount();
 return <MintWidgetSession key={`${props.address.toLowerCase()}:${wallet?.toLowerCase()||'disconnected'}`} {...props} wallet={wallet} isConnected={isConnected}/>;
}
function MintWidgetSession({address,fallbackPrice,maxSupply,wallet,isConnected,status='unknown'}:Props&{wallet:`0x${string}`|undefined;isConnected:boolean}){
 const contract=address as `0x${string}`;
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
 const [previews,setPreviews]=useState<Record<string,Preview>>({});
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();
  fetch(`/api/mintbay/mint-options/${address}?${new URLSearchParams(wallet?{wallet}:{})}`,{signal:abort.signal,cache:'no-store'})
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
 const options=tab==='holder' ? (data?.methods.holder??[]) : tab==='burn' ? (data?.methods.burn??[]) : (data?.methods.oneShot??[]);
 const chosen=options.find(t=>optionKey(t,address)===selected);
 useEffect(()=>{
  if(tab==='public'||options.length===0)return;
  const controller=new AbortController();
  const visible=options.slice(0,40);
  Promise.all(visible.map(async option=>{
   const key=optionKey(option,address);
   const source=hasSource(option)?option.source:address;
   try{
    const q=new URLSearchParams({source,tokenId:option.tokenId});
    const response=await fetch(`/api/mintbay/mint-preview?${q}`,{signal:controller.signal});
    if(!response.ok)return [key,{image:null,name:`#${option.tokenId}`}] as const;
    const result:unknown=await response.json();
    if(typeof result!=='object'||result===null)return [key,{image:null,name:`#${option.tokenId}`}] as const;
    const record=result as Record<string,unknown>;
    return [key,{image:typeof record.image==='string'?record.image:null,name:typeof record.name==='string'?record.name:`#${option.tokenId}`}] as const;
   }catch{return [key,{image:null,name:`#${option.tokenId}`}] as const;}
  })).then(entries=>{if(!controller.signal.aborted)setPreviews(previous=>({...previous,...Object.fromEntries(entries)}));});
  return()=>controller.abort();
 // A stable signature avoids re-fetching merely because a new options array was created.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[address,tab,data]);
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
    hash=await writeContractAsync({address:contract,abi,functionName:'holderClaim',args:[chosen.source as `0x${string}`,BigInt(chosen.tokenId)],value:BigInt(chosen.priceWei),chainId});
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
   setSuccess(hash);setRefresh(n=>n+1);setSelected('');
  }catch(e){setError(e instanceof Error?e.message:'Transaction failed');}finally{setBusy('');}
 }
 const labels:{[K in typeof tab]:string}={public:'PUBLIC MINT',holder:'HOLDER CLAIM',burn:'BURN & CLAIM',oneShot:'ONE SHOT'};
 return <div className="mb-mint">
  <div style={{marginBottom:20}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong>{minted!==null&&minted!==undefined?`${minted.toLocaleString()} / ${cap.toLocaleString()} MINTED`:`${cap.toLocaleString()} MAX SUPPLY`}</strong><span>{pct!==null?`${pct.toFixed(1)}%`:'—'}</span></div>
   <div role="progressbar" aria-label="NFT mint progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct??undefined} style={{height:12,border:'2px solid #151515',background:'#e7e7e3',marginTop:9,overflow:'hidden'}}>{pct!==null&&<div style={{height:'100%',width:`${pct}%`,background:'#caff45'}}/>}</div>
  </div>
  {!isConnected?<><div className="mb-price">{formatEther(price)} ETH <small>PER NFT</small></div><WalletConnect/></>:<>
   {loading?<p>CHECKING YOUR MINT OPTIONS…</p>:<>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:18}}>
     {(['public','holder','burn','oneShot'] as const).filter(k=>k==='public'||Boolean(data?.features[k])).map(k=><button key={k} type="button" onClick={()=>{setTab(k);setSelected('');setError('');}} style={{padding:'8px 11px',border:'2px solid #151515',font:'inherit',fontWeight:800,cursor:'pointer',background:tab===k?'#caff45':'transparent'}}>{labels[k]}{k!=='public'&&data?` (${data.methods[k].length})`:''}</button>)}
    </div>
    {tab==='public'?<>
     <div className="mb-price">{formatEther(price)} ETH <small>PER NFT</small></div>
     {allowance!==null&&<p>YOU CAN MINT {Math.min(allowance,remain??allowance)} MORE</p>}
     <label>QUANTITY <input type="number" min={1} max={Math.max(1,maxQty)} value={quantity} disabled={maxQty===0} onChange={e=>setQty(Math.max(1,Math.min(20,Number(e.target.value)||1)))}/></label>
     <strong>TOTAL: {formatEther(price*BigInt(quantity))} ETH + GAS</strong>
    </>:<>
     {options.length===0?<p>{data?.eligibilityError?'UNABLE TO VERIFY ELIGIBILITY RIGHT NOW.':'NO ELIGIBLE NFTs FOUND IN THIS WALLET.'}</p>:<>
      <div style={{marginBottom:14}}>
       <strong style={{display:'block',marginBottom:10}}>CHOOSE NFT</strong>
       <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))',gap:10}}>
        {options.map(option=>{
         const key=optionKey(option,address);
         const preview=previews[key];
         const picked=selected===key;
         return <button key={key} type="button" aria-pressed={picked} onClick={()=>{setSelected(key);}}
          style={{minWidth:0,padding:5,border:picked?'3px solid #151515':'2px solid #151515',background:picked?'#caff45':'#f7f7f1',color:'#151515',cursor:'pointer',font:'inherit',textAlign:'left'}}>
          <span style={{display:'block',position:'relative',aspectRatio:'1',background:'#e8e8e3',overflow:'hidden'}}>
           {preview?.image?<Image src={preview.image} alt={`${preview.name} token #${option.tokenId}`} fill unoptimized sizes="120px" style={{objectFit:'contain',imageRendering:'pixelated'}}/>:
            <span style={{display:'flex',height:'100%',alignItems:'center',justifyContent:'center',fontSize:12}}>{preview?'NO IMAGE':'LOADING…'}</span>}
          </span>
          <strong style={{display:'block',fontSize:13,marginTop:5}}>#{option.tokenId}</strong>
          {hasSource(option)&&<span style={{display:'block',fontSize:10,overflow:'hidden',textOverflow:'ellipsis'}}>{short(option.source)}</span>}
          {hasPrice(option)&&<span style={{display:'block',fontSize:10}}>{formatEther(BigInt(option.priceWei))} ETH</span>}
         </button>;
        })}
       </div>
       {chosen&&<p style={{marginTop:10,fontSize:12}}>SELECTED NFT #{chosen.tokenId}{hasSource(chosen)?` · ${short(chosen.source)}`:''}</p>}
      </div>
      {tab==='burn'&&chosen&&<p style={{fontSize:12,fontWeight:800,marginBottom:14}}>BURNING #{chosen.tokenId} PERMANENTLY DESTROYS THIS NFT.</p>}
      {tab==='oneShot'&&chosen&&<p style={{fontSize:12,fontWeight:800}}>ONE SHOT PERMANENTLY BURNS #{chosen.tokenId} AND MINTS ITS REPLACEMENT.</p>}
     </>}
    </>}
    {data?.eligibilityError&&<p role="status">SOME ELIGIBILITY CHECKS COULD NOT COMPLETE. TRY REFRESHING.</p>}
    {activeChain!==chainId?<button className="btn btn-lime" onClick={()=>switchChain?.({chainId})}>SWITCH TO ROBINHOOD</button>:<button className="btn btn-lime" disabled={Boolean(busy)||!client||(tab==='public'&&(maxQty===0||status==='minted_out'||remain===0))||(tab!=='public'&&!chosen)} onClick={()=>void perform()}>{busy?`${busy.toUpperCase()}…`:tab==='public'?'MINT NOW ↗':tab==='holder'?'CLAIM NOW ↗':tab==='burn'?'BURN & CLAIM ↗':'ONE SHOT ↗'}</button>}
   </>}
  </>}
  {success&&<p role="status">CONFIRMED! <a href={`https://robin.etherscan.io/tx/${success}`} target="_blank" rel="noreferrer">VIEW TRANSACTION ↗</a></p>}
  {error&&<p role="alert" style={{overflowWrap:'anywhere'}}>{error.slice(0,300)}</p>}
  {isConnected&&<button type="button" onClick={()=>{setRefresh(n=>n+1);setError('');}} style={{display:'block',background:'none',border:0,padding:'12px 0 0',font:'inherit',cursor:'pointer',textDecoration:'underline'}}>REFRESH ELIGIBILITY ↗</button>}
 </div>;
}
