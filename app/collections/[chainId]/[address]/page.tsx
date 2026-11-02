import { chainNames, supportedChains } from '@/lib/chains';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {collection,collectionTokens,mintStatus,ADDRESS,opensea,net,explorer} from '@/lib/mintbay-gallery';
import {MintWidget} from '@/components/mintbay/mint-widget';
import {CollectionTokens} from '@/components/mintbay/collection-tokens';
import {CollectionPromptPicker} from '@/components/mintbay/collection-prompt-picker';

type Params={params:Promise<{chainId:string;address:string}>};
export async function generateMetadata({params}:Params){
 const {chainId,address}=await params;
 const c=ADDRESS.test(address)?await collection(address,Number(chainId)):null;
 const url=`https://mintbay.fun/collections/${chainId}/${address.toLowerCase()}`;
 const imageUrl=`${url}/opengraph-image`;
 const title=c?`Mint ${c.name} on Mintbay`:'Mintbay Collection';
 const description=c?`Fully on-chain on ${chainNames[Number(chainId)] || chainId} · ${c.mintPriceEth} ${Number(chainId)===137?'POL':'ETH'} · ${c.maxSupply} max`:'Fully on-chain art';
 return {title,description,alternates:{canonical:url},openGraph:{title,description,url,type:'website',images:[{url:imageUrl,width:1200,height:630,alt:c?`${c.name} Mintbay collection`:'Mintbay collection'}]},twitter:{card:'summary_large_image',title,description,images:[imageUrl]}};
}
export default async function CollectionPage({params}:Params){
 const {chainId,address}=await params;
 if(!supportedChains.some(c=>c.id===Number(chainId))||!ADDRESS.test(address))notFound();
 const c=await collection(address,Number(chainId));if(!c)notFound();
 const mintState=await mintStatus(address,Number(chainId));
 const shareUrl=`https://mintbay.fun/collections/${chainId}/${address.toLowerCase()}`;
 const xShareUrl=`https://twitter.com/intent/tweet?${new URLSearchParams({text:`${c.name} — fully on-chain pixel art on ${chainNames[Number(chainId)] || chainId}.`,url:shareUrl}).toString()}`;
 let initial={tokens:[],next:null} as Awaited<ReturnType<typeof collectionTokens>>;
 let error='';try{initial=await collectionTokens(address,'0',24,false,Number(chainId))}catch{error='NFT gallery is temporarily unavailable.';}
 return <div className="interior section-wrap">
  <Link href="/collections" className="mb-back">← ALL COLLECTIONS</Link>
  <div className="mb-collection-hero">
   <div className="mb-square">{c.previewImage&&<img src={c.previewImage} alt={c.name}/>}</div>
   <div className="mb-collection-info">
    <span className="tag">[ {chainNames[Number(chainId)]} / FULLY ON-CHAIN ]</span>
    <h1>{c.name}</h1>
    <MintWidget chainId={Number(chainId)} address={address} fallbackPrice={c.mintPriceEth} maxSupply={c.maxSupply} status={mintState}/>
    <div className="mb-links"><a href={opensea(address,undefined,Number(chainId))} target="_blank" rel="noreferrer">OPENSEA ↗</a>{Number(chainId)===4663&&<a href={net(address)} target="_blank" rel="noreferrer">NET BAZAAR ↗</a>}<a href={explorer(address,Number(chainId))} target="_blank" rel="noreferrer">CONTRACT ↗</a><a href={xShareUrl} target="_blank" rel="noopener noreferrer">SHARE ON X ↗</a></div>
   </div>
  </div>
  <div className="mb-section-title">MINT WITH A PROMPT.</div>
  <CollectionPromptPicker name={c.name} chainName={chainNames[Number(chainId)]} address={address} />
  <CollectionTokens chainId={Number(chainId)} address={address} initial={initial.tokens} next={initial.next}/>{error&&<p>{error}</p>}
 </div>;
}
