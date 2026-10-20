"use client";

import {useState} from 'react';
import {CopyPrompt} from '@/components/mintbay/copy-prompt';

type Props={name:string;chainName:string;address:string};

export function CollectionPromptPicker({name,chainName,address}:Props){
 const [selected,setSelected]=useState(0);
 const where=`${name} on ${chainName}. Contract: ${address}.`;
 const prompts=[
  {label:'MINT ONE',text:`@bankrbot mint one NFT from ${where}`},
  {label:'AM I ELIGIBLE?',text:`@bankrbot check if my wallet qualifies for a free Holder Claim from ${where} Explain which NFT I need to hold and how to claim`},
  {label:'MY FREE CLAIMS',text:`@bankrbot how many free NFTs from ${where} can my wallet still claim? Check eligibility, previous claims, and remaining lifetime supply.`},
  {label:'COLLECTION STATUS',text:`@bankrbot check ${where} How many lifetime mint slots remain, what does minting cost, and is public mint currently available?`},
 ];
 return <div className="space-y-3">
  <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Bankr prompt suggestions">
   {prompts.map((prompt,index)=><button
    key={prompt.label} type="button" role="tab" aria-selected={selected===index}
    onClick={()=>setSelected(index)}
    className="border-2 border-current px-4 py-2 font-mono font-black transition-colors"
    style={{background:selected===index?'#caff45':'transparent',color:selected===index?'#151515':'inherit'}}
   >{index+1}</button>)}
  </div>
  <p className="text-xs font-black tracking-widest">{String(selected+1).padStart(2,'0')} / {prompts[selected].label}</p>
  <div className="mb-prompt" role="tabpanel"><code>{prompts[selected].text}</code><CopyPrompt text={prompts[selected].text}/></div>
 </div>;
}
