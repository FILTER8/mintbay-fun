import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {SectionHeading} from '@/components/section-heading';
import {collections,collectionHref} from '@/lib/mintbay-gallery';
export const metadata={title:'Collections'};
export default async function Collections(){let entries;try{entries=await collections()}catch{return <div className="interior section-wrap"><h1>COLLECTIONS.</h1><p>Collection index temporarily unavailable. Please try again.</p></div>}
return <div className="interior section-wrap"><SectionHeading index="001 / DISCOVER" title="THE COLLECTIONS." description="Fully on-chain art. Create it, mint it, share it."/><div className="mb-gallery-grid">{entries.map(c=><Link className="mb-art-card" href={collectionHref(c.contractAddress)} key={c.contractAddress}><div className="mb-square">{c.previewImage?<img src={c.previewImage} alt={c.name} />:<span>✳</span>}</div><div className="mb-card-text"><strong>{c.name}</strong><small>ROBINHOOD · {c.maxSupply} MAX · {c.mintPriceEth} ETH</small><span>VIEW & MINT <ArrowUpRight size={14}/></span></div></Link>)}<Link href="/studio" className="mb-art-card mb-create"><div className="mb-square">+</div><div className="mb-card-text"><strong>CREATE A COLLECTION</strong><small>YOUR ART BELONGS ON-CHAIN</small><span>OPEN STUDIO ↗</span></div></Link></div></div>}
