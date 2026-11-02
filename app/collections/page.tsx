import {SectionHeading} from '@/components/section-heading';
import {CollectionsGrid} from '@/components/mintbay/collections-grid';
import {collections} from '@/lib/mintbay-gallery';
export const metadata={title:'Collections'};
export default async function Collections(){
 let entries;
 try{entries=await collections()}catch{return <div className="interior section-wrap"><h1>COLLECTIONS.</h1><p>Collection index temporarily unavailable. Please try again.</p></div>}
 return <div className="interior section-wrap"><SectionHeading index="001 / DISCOVER" title="THE COLLECTIONS." description="Fully on-chain art. Create it, mint it, share it."/><CollectionsGrid entries={entries}/></div>
}
