'use client';

import { useState } from 'react';
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi';
import { parseEther, formatEther, parseAbi } from 'viem';
import { WalletConnect } from '@/components/wallet-connect';

const abi = parseAbi([
  'function mint(uint256 quantity) payable',
  'function price() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
]);

type Props = {
  address: string;
  fallbackPrice: string;
  status?: 'open' | 'minted_out' | 'unknown';
};

export function MintWidget({ address, fallbackPrice, status = 'unknown' }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [qty, setQty] = useState(1);
  // wagmi v2 exposes the transaction hash as data, not hash.
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { data: price } = useReadContract({
    address: address as `0x${string}`, abi, functionName: 'price', chainId: 4663,
    query: { refetchInterval: 15000 },
  });
  const unitPrice = typeof price === 'bigint' ? price : parseEther(fallbackPrice);
  const total = unitPrice * BigInt(qty);

  return <div className="mb-mint">
    {status === 'minted_out' && <strong className="mb-status minted-out">MINTED OUT · SECONDARY MARKET ONLY</strong>}
    <div className="mb-price">{formatEther(unitPrice)} ETH <small>PER NFT</small></div>
    <label>QUANTITY <input type="number" min={1} max={20} value={qty}
      onChange={(event) => setQty(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label>
    <strong>TOTAL: {formatEther(total)} ETH + GAS</strong>
    {!isConnected ? <WalletConnect /> : chainId !== 4663 ?
      <button className="btn btn-lime" onClick={() => switchChain?.({ chainId: 4663 })}>SWITCH TO ROBINHOOD</button> :
      <button className="btn btn-lime" disabled={status === 'minted_out' || isPending || isConfirming}
        onClick={() => writeContract({ address: address as `0x${string}`, abi, functionName: 'mint', args: [BigInt(qty)], value: total, chainId: 4663 })}>
        {isPending ? 'CONFIRM IN WALLET…' : isConfirming ? 'MINTING…' : status === 'minted_out' ? 'MINTED OUT' : 'MINT NOW ↗'}
      </button>}
    {isSuccess && hash && <p role="status">MINT CONFIRMED! <a href={`https://robin.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">VIEW TX ↗</a></p>}
    {error && <p role="alert">{error.message.slice(0, 240)}</p>}
  </div>;
}
