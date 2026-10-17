import Link from 'next/link';
import { ArrowUpRight, Shuffle } from 'lucide-react';
import { SectionHeading } from '@/components/section-heading';
export const metadata={title:'Collections'};
export default function Collections(){return <div className="interior section-wrap"><SectionHeading index="001 / DISCOVER" title="THE COLLECTIONS." description="Originals, remixes and everything in between. Every piece begins somewhere."/><div className="state-panel"><div className="state-symbol">✳</div><div><span className="tag">[ INDEX BOOTING UP ]</span><h2>THE WALL IS WAITING.</h2><p>Our new collection index will appear here. We’re not showing made-up collections or pretending the new gallery is live.</p><div className="panel-actions"><Link href="https://mintbay.xyz/collections" className="btn btn-lime">EXPLORE CLASSIC MINTBAY <ArrowUpRight size={16}/></Link><Link href="/studio" className="btn btn-outline">CREATE SOMETHING <Shuffle size={16}/></Link></div></div></div></div>}
