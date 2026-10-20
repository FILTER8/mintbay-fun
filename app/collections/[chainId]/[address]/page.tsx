import {notFound} from 'next/navigation';
import Link from 'next/link';
import {collection,collectionTokens,mintStatus,ADDRESS,opensea,net,explorer} from '@/lib/mintbay-gallery';
import {MintWidget} from '@/components/mintbay/mint-widget';
import {CollectionTokens} from '@/components/mintbay/collection-tokens';
import {CollectionPromptPicker} from '@/components/mintbay/collection-prompt-picker';
import {CollectionActions} from '@/components/mintbay/collection-actions';

type Params={params:Promise<{chainId:string;address:string}>};
export async function generateMetadata({params}:Params){
 const {chainId,address}=await params;
 const c=chainId==='4663'&&ADDRESS.test(address)?await collection(address):null;
 return {title:c?c.name:'Collection',description:c?`Mint ${c.name} on Robinhood Chain. Contract: ${address}`:undefined,openGraph:c?{title:`Mint ${c.name} on Mintbay`,description:`Fully on-chain on Robinhood Chain. Contract: ${address}`,url:`https://mintbay.fun/collections/4663/${address.toLowerCase()}`,type:'website'}:undefined,twitter:{card:'summary_large_image',title:c?`Mint ${c.name} on Mintbay`:'Mintbay Collection',description:c?`Fully on-chain on Robinhood Chain · ${c.mintPriceEth} ETH · ${c.maxSupply} max`:'Fully on-chain art'}};
}
export default async function CollectionPage({params}:Params){
 const {chainId,address}=await params;
 if(chainId!=='4663'||!ADDRESS.test(address))notFound();
 const c=await collection(address);if(!c)notFound();
 const mintState=await mintStatus(address);
 let initial={tokens:[],next:null} as Awaited<ReturnType<typeof collectionTokens>>;
 let error='';try{initial=await collectionTokens(address)}catch{error='NFT gallery is temporarily unavailable.';}
 return <div className="interior section-wrap">
  <Link href="/collections" className="mb-back">← ALL COLLECTIONS</Link>
  <div className="mb-collection-hero">
   <div className="mb-square">{c.previewImage&&<img src={c.previewImage} alt={c.name}/>}</div>
   <div className="mb-collection-info">
    <span className="tag">[ ROBINHOOD CHAIN / FULLY ON-CHAIN ]</span>
    <h1>{c.name}</h1>
    <MintWidget address={address} fallbackPrice={c.mintPriceEth} maxSupply={c.maxSupply} status={mintState}/>
    <div className="mb-links"><a href={opensea(address)} target="_blank" rel="noreferrer">OPENSEA ↗</a><a href={net(address)} target="_blank" rel="noreferrer">NET BAZAAR ↗</a><a href={explorer(address)} target="_blank" rel="noreferrer">CONTRACT ↗</a><CollectionActions name={c.name} address={address}/></div>
   </div>
  </div>
  <div className="mb-section-title">MINT WITH A PROMPT.</div>
  <CollectionPromptPicker name={c.name} chainName="Robinhood Chain" address={address} />
  <CollectionTokens address={address} initial={initial.tokens} next={initial.next}/>{error&&<p>{error}</p>}
 </div>;
}
