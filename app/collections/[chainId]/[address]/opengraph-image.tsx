import { ImageResponse } from 'next/og';
import { collection, ADDRESS } from '@/lib/mintbay-gallery';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const alt = 'Mintbay collection — mint fully on-chain art';
export const contentType = 'image/png';

export default async function Image({params}:{params:Promise<{chainId:string;address:string}>}){
 const {chainId,address}=await params;
 const c=chainId==='4663'&&ADDRESS.test(address)?await collection(address).catch(()=>null):null;
 const image=c?.previewImage||'';
 const src=image.startsWith('data:image/')||image.startsWith('https://')?image:undefined;
 return new ImageResponse(
  <div style={{width:'100%',height:'100%',display:'flex',padding:56,background:'#151515',color:'#f7f7f1',fontFamily:'monospace',gap:52,alignItems:'center'}}>
   <div style={{width:505,height:505,background:'#f7f7f1',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
    {src?<img src={src} width={505} height={505} style={{imageRendering:'pixelated'}}/>:<span style={{fontSize:100}}>✳</span>}
   </div>
   <div style={{display:'flex',flexDirection:'column',width:525,gap:26}}>
    <span style={{fontSize:29,color:'#caff45',fontWeight:800}}>MINTBAY.FUN</span>
    <span style={{fontSize:62,fontWeight:900,lineHeight:1.1,overflowWrap:'break-word'}}>{c?.name||'ON-CHAIN COLLECTION'}</span>
    <span style={{fontSize:26}}>MINT ON ROBINHOOD CHAIN</span>
    <span style={{fontSize:23,color:'#aaa'}}>{c?`${c.mintPriceEth} ETH · ${c.maxSupply} MAX`:'FULLY ON-CHAIN'}</span>
    <span style={{fontSize:17,color:'#caff45'}}>{address}</span>
   </div>
  </div>,size);
}
