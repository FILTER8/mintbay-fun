'use client';
import {useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {chainNames} from '@/lib/chains';
import {collectionHref,type Collection} from '@/lib/mintbay-gallery-shared';

const filters=[{id:0,label:'ALL'},{id:1,label:'ETHEREUM'},{id:130,label:'UNICHAIN'},{id:137,label:'POLYGON'},{id:4663,label:'ROBINHOOD'},{id:8453,label:'BASE'},{id:42161,label:'ARBITRUM'}];
export function CollectionsGrid({entries}:{entries:Collection[]}) {
 const [active,setActive]=useState(0);
 const visible=active===0?entries:entries.filter(c=>c.chainId===active);
 return <>
  <div role="group" aria-label="Filter by blockchain" style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:24}}>
   {filters.map(f=><button key={f.id} type="button" aria-pressed={active===f.id} onClick={()=>setActive(f.id)} style={{font:'inherit',fontSize:12,fontWeight:800,padding:'9px 12px',border:'2px solid #151515',background:active===f.id?'#caff45':'transparent',cursor:'pointer'}}>{f.label}</button>)}
  </div>
  {visible.length===0&&<p>NO COLLECTIONS ON THIS CHAIN YET.</p>}
  <div className="mb-gallery-grid">
   {visible.map(c=><Link className="mb-art-card" href={collectionHref(c.contractAddress,c.chainId)} key={`${c.chainId}:${c.contractAddress}`}><div className="mb-square">{c.previewImage?<img src={c.previewImage} alt={c.name}/>:<span>✳</span>}</div><div className="mb-card-text"><strong>{c.name}</strong><small>{chainNames[c.chainId]||c.chainId} · {c.maxSupply} MAX · {c.mintPriceEth} {c.chainId===137?'POL':'ETH'}</small><span>VIEW & MINT <ArrowUpRight size={14}/></span></div></Link>)}
   <Link href="/studio" className="mb-art-card mb-create"><div className="mb-square">+</div><div className="mb-card-text"><strong>CREATE A COLLECTION</strong><small>YOUR ART BELONGS ON-CHAIN</small><span>OPEN STUDIO ↗</span></div></Link>
  </div>
 </>;
}
