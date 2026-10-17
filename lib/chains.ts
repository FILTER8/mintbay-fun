import { defineChain, type Chain } from 'viem';
import { mainnet, base, polygon, arbitrum } from 'viem/chains';
export const robinhood = defineChain({
  id:4663,name:'Robinhood Chain',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},
  rpcUrls:{default:{http:['https://rpc.robinhoodchain.com']}},
  blockExplorers:{default:{name:'Robinhood Etherscan',url:'https://robin.etherscan.io'}},
});
export const unichain = defineChain({
  id:130,name:'Unichain',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},
  rpcUrls:{default:{http:['https://mainnet.unichain.org']}},
  blockExplorers:{default:{name:'Uniscan',url:'https://uniscan.xyz'}},
});
export const supportedChains = [robinhood,base,mainnet,polygon,unichain,arbitrum] as const satisfies readonly Chain[];
export const chainNames:Record<number,string>={4663:'ROBINHOOD',8453:'BASE',1:'ETHEREUM',137:'POLYGON',130:'UNICHAIN',42161:'ARBITRUM'};
export const publicRpc:Record<number,string>={
  4663:'https://rpc.robinhoodchain.com',8453:'https://mainnet.base.org',1:'https://ethereum-rpc.publicnode.com',
  137:'https://polygon-bor-rpc.publicnode.com',130:'https://mainnet.unichain.org',42161:'https://arb1.arbitrum.io/rpc'
};
// Alchemy key is server-only; unconfigured chains use their public RPC. No secret is exposed to the client.
export const alchemyNetwork:Partial<Record<number,string>>={1:'eth-mainnet',8453:'base-mainnet',137:'polygon-mainnet',42161:'arb-mainnet'};
