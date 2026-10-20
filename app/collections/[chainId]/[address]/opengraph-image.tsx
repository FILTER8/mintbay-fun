import { ImageResponse } from 'next/og';
import { collection, mintStatus, ADDRESS } from '@/lib/mintbay-gallery';
import { encodeFunctionData, decodeFunctionResult, parseAbi } from 'viem';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const alt = 'Mintbay collection — on-chain artwork, mint price and lifetime mint progress';
export const contentType = 'image/png';

export default async function Image({params}:{params:Promise<{chainId:string;address:string}>}){
 const {chainId,address}=await params;
 const c=chainId==='4663'&&ADDRESS.test(address)?await collection(address).catch(()=>null):null;
 const src=c?.previewImage&&(c.previewImage.startsWith('data:image/')||c.previewImage.startsWith('https://'))?c.previewImage:undefined;
 // Read the new public lifetime counter where available. Older contracts can
 // still be confirmed sold out by the existing MaxSupplyExceeded() simulation.
 let minted: bigint | null = null;
 if(c){
  const apiKey=process.env.ALCHEMY_API_KEY;
  const rpc=apiKey?`https://robinhood-mainnet.g.alchemy.com/v2/${apiKey}`:process.env.ROBINHOOD_RPC_URL;
  if(rpc){
   try{
    const abi=parseAbi(['function totalMinted() view returns (uint256)']);
    const data=encodeFunctionData({abi,functionName:'totalMinted'});
    const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:address,data},'latest']}),cache:'no-store'});
    const json=await response.json();
    if(response.ok && typeof json.result==='string' && json.result!=='0x'){
     minted=decodeFunctionResult({abi,functionName:'totalMinted',data:json.result}) as bigint;
    }
   }catch{/* Old contracts have no totalMinted() getter. */}
  }
 }
 const soldOut = c ? (minted!==null && minted>=BigInt(c.maxSupply)) || (minted===null && await mintStatus(address)==='minted_out') : false;
 if(soldOut && minted===null && c) minted=BigInt(c.maxSupply);
 const percent=c&&minted!==null&&c.maxSupply>0?Math.max(0,Math.min(100,Number(minted)*100/c.maxSupply)):null;
 const nativeCurrency=chainId==='137'?'POL':'ETH';
 return new ImageResponse(
  <div style={{width:1200,height:630,display:'flex',padding:52,background:'#151515',color:'#f7f7f1',fontFamily:'monospace',gap:44,alignItems:'center'}}>
   <div style={{width:526,height:526,flexShrink:0,border:'4px solid #caff45',background:'#f7f7f1',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
    {src?<img src={src} width={518} height={518} style={{objectFit:'contain',imageRendering:'pixelated'}}/>:<span style={{fontSize:100,color:'#151515'}}>✳</span>}
   </div>
   <div style={{display:'flex',flexDirection:'column',width:526,height:526,justifyContent:'space-between',paddingTop:8,paddingBottom:8}}>
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
     <span style={{fontSize:29,color:'#caff45',fontWeight:900}}>MINTBAY.FUN ✳</span>
     <div style={{fontSize:56,fontWeight:900,lineHeight:1.06,overflowWrap:'break-word',maxHeight:235,overflow:'hidden'}}>{c?.name||'ON-CHAIN COLLECTION'}</div>
     <span style={{fontSize:22,color:'#caff45'}}>ROBINHOOD CHAIN · FULLY ON-CHAIN</span>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
     <span style={{fontSize:29,fontWeight:800}}>{c?`${c.mintPriceEth} ${nativeCurrency}`:'MINT ON MINTBAY'}</span>
     <span style={{fontSize:24,color:'#c9c9c9'}}>{c ? minted!==null ? `${minted.toLocaleString()} / ${c.maxSupply.toLocaleString()} MINTED` : `${c.maxSupply.toLocaleString()} MAX SUPPLY` : 'MAKE ART. HAVE FUN.'}</span>
     {percent!==null&&<div style={{display:'flex',width:'100%',height:13,border:'2px solid #caff45',background:'#323232'}}><div style={{width:`${percent}%`,height:'100%',background:'#caff45'}}/></div>}
     {soldOut&&<span style={{fontSize:23,color:'#caff45',fontWeight:900}}>SOLD OUT · 100%</span>}
     {!soldOut&&percent!==null&&<span style={{fontSize:19,color:'#caff45'}}>{percent.toFixed(1)}% MINTED</span>}

     <span style={{fontSize:16,color:'#caff45',overflowWrap:'break-word'}}>{address.toLowerCase()}</span>
    </div>
   </div>
  </div>,size);
}
