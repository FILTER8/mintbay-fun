"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { WalletConnect } from "@/components/wallet-connect";

export default function ProfilePage() {
  const router = useRouter();
  const { address, isConnected, isReconnecting } = useAccount();

  useEffect(() => {
    if (isConnected && address) {
      router.replace(`/profile/${address.toLowerCase()}`);
    }
  }, [address, isConnected, router]);

  return (
    <div className="interior section-wrap">
      <div className="inner-title">
        <div className="section-index">[ PROFILE / COLLECTION ]</div>
        <h1>MY GALLERY.</h1>
        <p>Your fully on-chain Mintbay collection, without the clutter.</p>
      </div>
      <div className="mb-profile-start" aria-live="polite">
        {address && isConnected ? (
          <p>OPENING YOUR GALLERY...</p>
        ) : isReconnecting ? (
          <p>CONNECTING WALLET...</p>
        ) : (
          <WalletConnect />
        )}
      </div>
    </div>
  );
}
