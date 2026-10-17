"use client";
import { useMemo, useState } from 'react';
const W=24;
const colors=['#111210','#111210','#111210','#111210','#c7fa45','#f4a6bb','#fff6dd','#9b95ff'];
function makeArt(seed:number){const grid:number[][]=[];for(let y=0;y<W;y++){const row=[];for(let x=0;x<W;x++){const dx=Math.abs(x-11.5),dy=y;
 let v=0;
 if(dx<8 && dy>=5&&dy<=19)v=1;
 if(dx<9&&dy>=3&&dy<7)v=4;
 if(dx<7&&dy>=8&&dy<16)v=6;
 if(dx<7&&dy>=16&&dy<21)v=5;
 if(dx<5&&dy>=11&&dy<13)v=1;
 if((x===8||x===15)&&dy===11)v=7;
 if(dx<3&&dy===16)v=1;
 if(dx<2&&dy===15)v=5;
 if((x*19+y*17+seed*7)%43===0&&dx>8)v=7;
 if((x*11+y*29+seed*13)%71===0&&dx>8)v=4;
 if(seed%3===1&&dy<7&&dx<7)v=7;
 if(seed%3===2&&dy>=16&&dy<=20&&dx<7)v=4;
 row.push(v); }grid.push(row);}return grid.flat();}
export function PixelArt({mini=false}:{mini?:boolean}){const [seed,setSeed]=useState(0);const cells=useMemo(()=>makeArt(seed),[seed]);return <button type="button" onClick={()=>setSeed(n=>n+1)} className={`pixel-art ${mini?'mini':''}`} title="Click to remix the colors" aria-label="Remix the pixel artwork"><div className="pixel-grid">{cells.map((c,i)=><i key={i} style={{background:c?colors[c]:'transparent'}}/>)}</div>{!mini&&<span className="pixel-hint">[ CLICK TO REMIX ↗ ]</span>}</button>}
