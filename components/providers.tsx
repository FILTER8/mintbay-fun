'use client';

import { type ReactNode, useState } from 'react';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supportedChains } from '@/lib/chains';

// Public project ID, not a private key. Register https://mintbay.fun at https://dashboard.reown.com.
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

const connectors = [
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId
    ? [walletConnect({
        projectId: walletConnectProjectId,
        showQrModal: true,
        metadata: {
          name: 'Mintbay.fun',
          description: 'Create and mint fully on-chain art',
          url: 'https://mintbay.fun',
          icons: ['https://mintbay.fun/icon.png'],
        },
      })]
    : []),
];

export const config = createConfig({
  chains: supportedChains,
  connectors,
  transports: {
    4663: http('/api/rpc/4663'),
    8453: http('/api/rpc/8453'),
    1: http('/api/rpc/1'),
    137: http('/api/rpc/137'),
    130: http('/api/rpc/130'),
    42161: http('/api/rpc/42161'),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
