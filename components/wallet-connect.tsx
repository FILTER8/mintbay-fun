"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { useState } from 'react';
import { Wallet, ChevronDown, LogOut, Copy, Check, ArrowUpRight } from 'lucide-react';
import { supportedChains, chainNames } from '@/lib/chains';
export function WalletConnect(){
  const {address,isConnected,chainId}=useAccount();
  const {connect,connectors,isPending,error}=useConnect();
  const {disconnect}=useDisconnect();
  const {switchChain,isPending:changing}=useSwitchChain();
  const [open,setOpen]=useState(false); const [copied,setCopied]=useState(false);
  const short = address ? `${address.slice(0,6)}…${address.slice(-4)}` : '';
  async function copy(){if(!address)return;await navigator.clipboard.writeText(address);setCopied(true);setTimeout(()=>setCopied(false),1500);}
  return <div className="wallet-wrap">
    <button className={`wallet-button ${isConnected?'connected':''}`} onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label="Wallet menu">
      <Wallet size={14}/><span>{isConnected?short:'CONNECT WALLET'}</span><ChevronDown size={12}/>
    </button>
    {open&&<div className="wallet-popover">
      {isConnected ? <>
        <div className="popover-label">CONNECTED WALLET</div>
        <button className="popover-line" onClick={copy}><span>{short}</span>{copied?<Check size={14}/>:<Copy size={14}/>}</button>
        <div className="popover-label spaced">SWITCH NETWORK</div>
        {supportedChains.map(c=><button className="popover-line" key={c.id} disabled={changing} onClick={()=>{switchChain({chainId:c.id});setOpen(false);}}><span>{chainNames[c.id]}</span>{chainId===c.id?<span className="status-dot"/>:<ArrowUpRight size={13}/>}</button>)}
        <button className="popover-line disconnect" onClick={()=>{disconnect();setOpen(false);}}><span>DISCONNECT</span><LogOut size={13}/></button>
      </> : <>
        <div className="popover-label">CONNECT A BROWSER WALLET</div>
        {connectors.map(connector=><button key={connector.uid} className="popover-line" disabled={isPending} onClick={()=>{connect({connector});setOpen(false);}}><span>{connector.name}</span><ArrowUpRight size={13}/></button>)}
        <div className="popover-foot">Requires an installed EVM wallet extension (e.g. MetaMask, Rabby).</div>
        {error&&<div className="popover-error">{error.message.slice(0,140)}</div>}
      </>}
    </div>}
  </div>
}
