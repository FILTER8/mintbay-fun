import { ImageResponse } from 'next/og';
import { collection, ADDRESS } from '@/lib/mintbay-gallery';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const alt = 'Mintbay collection — fully on-chain artwork, mint price and supply';
export const contentType = 'image/png';

export default async function Image({params}:{params:Promise<{chainId:string;address:string}>}){
 const {chainId,address}=await params;
 const c=chainId==='4663'&&ADDRESS.test(address)?await collection(address).catch(()=>null):null;
 const src=c?.previewImage&&(c.previewImage.startsWith('data:image/')||c.previewImage.startsWith('https://'))?c.previewImage:undefined;
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
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
     <span style={{fontSize:29,fontWeight:800}}>{c?`${c.mintPriceEth} ${nativeCurrency}`:'MINT ON MINTBAY'}</span>
     <span style={{fontSize:24,color:'#c9c9c9'}}>{c?`${c.maxSupply.toLocaleString()} MAX SUPPLY`:'MAKE ART. HAVE FUN.'}</span>
     <span style={{fontSize:16,color:'#caff45',overflowWrap:'break-word'}}>{address.toLowerCase()}</span>
    </div>
   </div>
  </div>,size);
}
