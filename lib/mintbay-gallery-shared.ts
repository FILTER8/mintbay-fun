export type NFT={contract:string;tokenId:string;name:string;image:string|null;attributes:{trait_type:string;value:string}[];owner:string|null;acquiredAt?:string;chainId?:number};
export const tokenHref=(a:string,id:string,chain=4663)=>`/collections/${chain}/${a.toLowerCase()}/${id}`;

export type Collection={chainId:number;contractAddress:string;name:string;symbol:string;maxSupply:number;mintPriceEth:string;previewImage:string|null;firstMintTokenId?:string|null;buildId?:string;deployedAt:string};
export const collectionHref=(a:string,chain=4663)=>`/collections/${chain}/${a.toLowerCase()}`;
