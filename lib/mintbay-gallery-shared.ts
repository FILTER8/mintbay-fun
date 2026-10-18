export type NFT={contract:string;tokenId:string;name:string;image:string|null;attributes:{trait_type:string;value:string}[];owner:string|null;acquiredAt?:string};
export const tokenHref=(a:string,id:string)=>`/collections/4663/${a.toLowerCase()}/${id}`;
