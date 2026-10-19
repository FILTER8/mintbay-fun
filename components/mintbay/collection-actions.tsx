'use client';
export function CollectionActions({name,address}:{name:string;address:string}){
 const url=`https://mintbay.fun/collections/4663/${address.toLowerCase()}`;
 const text=`Mint ${name} on Robinhood Chain. Contract: ${address}`;
 const intent=`https://twitter.com/intent/tweet?${new URLSearchParams({text,url})}`;
 return <a href={intent} target="_blank" rel="noopener noreferrer">SHARE ON X ↗</a>;
}
