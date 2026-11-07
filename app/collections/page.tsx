import { SectionHeading } from '@/components/section-heading';
import { CollectionsGrid } from '@/components/mintbay/collections-grid';
import { collectionMintSummary, collections, type CollectionMintSummary, type Collection } from '@/lib/mintbay-gallery';

export const metadata = {title:'Collections'};

export default async function Collections() {
 let entries: Collection[];
 try { entries = await collections(); }
 catch {
  return <div className="interior section-wrap"><h1>COLLECTIONS.</h1><p>Collection index temporarily unavailable. Please try again.</p></div>;
 }

 // Cap simultaneous RPC requests; a failed or unavailable status check must
 // never hide the collection itself or accidentally mark it SOLD OUT.
 const withStatus: Array<Collection & {mintInfo: CollectionMintSummary | null}> = [];
 for (let start = 0; start < entries.length; start += 6) {
  const batch = entries.slice(start, start + 6);
  const checked = await Promise.all(batch.map(async entry => ({
   ...entry,
   mintInfo: await collectionMintSummary(entry).catch(() => null),
  })));
  withStatus.push(...checked);
 }
 return <div className="interior section-wrap">
  <SectionHeading index="001 / DISCOVER" title="THE COLLECTIONS." description="Fully on-chain art. Create it, mint it, share it."/>
  <CollectionsGrid entries={withStatus}/>
 </div>;
}
