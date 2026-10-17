"use client";
import { ReactNode, useState } from 'react';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supportedChains } from '@/lib/chains';
const config = createConfig({
  chains:supportedChains,
  connectors:[injected({shimDisconnect:true})],
  transports: {
    4663: http('/api/rpc/4663'),
    8453: http('/api/rpc/8453'),
    1: http('/api/rpc/1'),
    137: http('/api/rpc/137'),
    130: http('/api/rpc/130'),
    42161: http('/api/rpc/42161'),
  },
  ssr:true,
});
export function Providers({children}:{children:ReactNode}){
  const [client]=useState(()=>new QueryClient());
  return <WagmiProvider config={config}><QueryClientProvider client={client}>{children}</QueryClientProvider></WagmiProvider>;
}
