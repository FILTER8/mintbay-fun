'use client';
export function CollectionActions({name,address,chainId=4663}:{name:string;address:string;chainId?:number}){
 const url=`https://mintbay.fun/collections/${chainId}/${address.toLowerCase()}`;
 const text=`Mint ${name} on chain ${chainId}. Contract: ${address}`;
 const intent=`https://twitter.com/intent/tweet?${new URLSearchParams({text,url})}`;
 return <a href={intent} target="_blank" rel="noopener noreferrer">SHARE ON X ↗</a>;
}
