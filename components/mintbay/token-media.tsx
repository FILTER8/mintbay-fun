
'use client';

/* eslint-disable @next/next/no-img-element -- NFT data URLs cannot use next/image */

import { useEffect, useRef, useState } from 'react';
import { Expand, Image as ImageIcon, Play } from 'lucide-react';

interface TokenMediaProps {
  image: string | null;
  animationUrl?: string | null;
  name: string;
  collectionAddress?: string;
  tokenId?: string;
}

export function TokenMedia({
  image,
  animationUrl,
  name,
  collectionAddress,
  tokenId,
}: TokenMediaProps) {
  const playable =
    typeof animationUrl === 'string' &&
    /^(data:text\/html(?:;charset=[^;,]+)?;base64,|https:\/\/)/i.test(
      animationUrl
    );

  const [mode, setMode] = useState<'image' | 'animation'>(
    playable ? 'animation' : 'image'
  );

  // ArcadeMachine-only wallet bridge: other NFTs keep their original sandbox behavior.
  const ARCADE_COLLECTION = '0x0e2f6f18e7dcd0f608e4f338c8c36f04f4db1ea3';
  const OCH = '0x8bdd5adff8a9d08372323d5baf5e8e52605af983';
  const VAULT = '0x4ba05708e716d77e4de93b76d7ff7cc31a0ad991';
  const ENGINE = '0xb9a6246ca46532b31509847a3d466cd0a4173dec';
  const CHAIN = '0x1237';
  const isArcade = collectionAddress?.toLowerCase() === ARCADE_COLLECTION &&
    typeof tokenId === 'string' && /^\d+$/.test(tokenId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const connectedAccount = useRef<string | null>(null);
  const bridgeToken = useRef('');

  // The original token HTML remains on-chain. Only a small wallet-provider shim
  // is prepended in memory for this viewer; the NFT bytes are not changed.
  const [arcadeDocument, setArcadeDocument] = useState<string | null>(null);
  useEffect(() => {
    let nextDocument: string | null = null;
    let cancelled = false;
    const publish = (doc: string | null) => {
      // Schedule React state updates outside the synchronous effect body.
      void Promise.resolve().then(() => {
        if (!cancelled) setArcadeDocument(doc);
      });
    };
    bridgeToken.current = '';
    if (!isArcade || !animationUrl?.startsWith('data:text/html')) {
      publish(null);
      return () => { cancelled = true; bridgeToken.current = ''; };
    }
    const match = /^data:text\/html(?:;charset=[^;,]+)?;base64,/i.exec(animationUrl);
    const base64 = match ? animationUrl.slice(match[0].length) : null;
    if (!base64) { publish(null); return () => { cancelled = true; bridgeToken.current = ''; }; }
    try {
      const binary = atob(base64.replace(/\s/g, ''));
      const html = new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
      const token = crypto.randomUUID();
      bridgeToken.current = token;
      const shim = `<script>
      (() => {
        const channel = ${JSON.stringify('MINTBAY_ARCADE_WALLET_V1')};
        const secret = ${JSON.stringify(token)};
        let nextId = 0;
        const pending = new Map();
        const listeners = new Map();
        window.addEventListener('message', e => {
          if (e.source !== parent || !e.data || e.data.channel !== channel || e.data.secret !== secret) return;
          const d = e.data;
          if (d.type === 'result') {
            const p = pending.get(d.id);
            if (!p) return;
            pending.delete(d.id);
            if (d.error) p.reject(Object.assign(new Error(d.error.message || 'Wallet request failed'), { code: d.error.code }));
            else p.resolve(d.result);
          } else if (d.type === 'event') {
            for (const fn of listeners.get(d.event) || []) try { fn(d.args); } catch (_) {}
          }
        });
        window.ethereum = {
          isMintbayBridge: true,
          request: ({ method, params = [] }) => new Promise((resolve, reject) => {
            const id = ++nextId;
            pending.set(id, {resolve, reject});
            parent.postMessage({channel, secret, type:'request', id, method, params}, '*');
          }),
          on: (event, fn) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(fn);
          },
          removeListener: (event, fn) => listeners.get(event)?.delete(fn),
        };
      })();
      <\/script>`;
      nextDocument = html.replace(/<head([^>]*)>/i, `<head$1>${shim}`);
    } catch (err) {
      console.error('ArcadeMachine HTML decoding failed:', err);
    }
    publish(nextDocument);
    return () => { cancelled = true; bridgeToken.current = ''; };
  }, [animationUrl, isArcade]);

  useEffect(() => {
    if (!arcadeDocument || !isArcade) return;
    const channel = 'MINTBAY_ARCADE_WALLET_V1';
    const provider = (window as Window & { ethereum?: { request: (args: {method:string; params?: unknown[]}) => Promise<unknown>; on?: (name:string, fn:(arg:unknown)=>void)=>void; removeListener?: (name:string, fn:(arg:unknown)=>void)=>void } }).ethereum;
    const addr = (x: unknown) => typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x);
    const hex = (x: unknown) => typeof x === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(x);
    const hexData = (x: unknown) => typeof x === 'string' && /^0x[0-9a-fA-F]*$/.test(x);
    const bigint = (x: string) => BigInt(x);
    const targetId = BigInt(tokenId!);
    let active = true;
    const relay = (event: string, args: unknown) => {
      iframeRef.current?.contentWindow?.postMessage({ channel, secret: bridgeToken.current, type: 'event', event, args }, '*');
    };
    const onAccounts = (a: unknown) => {
      const accounts = Array.isArray(a) ? a : [];
      connectedAccount.current = typeof accounts[0] === 'string' ? accounts[0] : null;
      relay('accountsChanged', accounts);
    };
    const onChain = (c: unknown) => relay('chainChanged', c);
    provider?.on?.('accountsChanged', onAccounts);
    provider?.on?.('chainChanged', onChain);

    const listener = async (event: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow;
      const msg = event.data;
      if (!active || !frame || event.source !== frame || !msg || msg.channel !== channel ||
          msg.secret !== bridgeToken.current || msg.type !== 'request' ||
          !Number.isSafeInteger(msg.id) || typeof msg.method !== 'string') return;
      const send = (result?: unknown, error?: {code:number; message:string}) => {
        if (active && iframeRef.current?.contentWindow === frame)
          frame.postMessage({channel, secret:bridgeToken.current, type:'result', id:msg.id, result, error}, '*');
      };
      try {
        if (!provider) throw Object.assign(new Error('No injected wallet on Mintbay. Open Mintbay in your wallet browser.'), {code:4900});
        const method: string = msg.method;
        const params = Array.isArray(msg.params) ? msg.params : [];
        if (JSON.stringify(params).length > 150000) throw new Error('Wallet request too large');
        if (!['eth_accounts','eth_requestAccounts','eth_chainId','wallet_switchEthereumChain',
          'wallet_addEthereumChain','eth_call','eth_getTransactionReceipt','eth_sendTransaction'].includes(method))
          throw new Error('Wallet method not permitted for ArcadeMachine');
        if (method === 'wallet_switchEthereumChain' &&
            (params.length !== 1 || (params[0] as {chainId?:string})?.chainId?.toLowerCase() !== CHAIN))
          throw new Error('Invalid target chain');
        if (method === 'wallet_addEthereumChain' &&
            (params.length !== 1 || (params[0] as {chainId?:string})?.chainId?.toLowerCase() !== CHAIN ||
             !(params[0] as {rpcUrls?:string[]}).rpcUrls?.includes('https://rpc.mainnet.chain.robinhood.com')))
          throw new Error('Invalid target chain');
        if (method === 'eth_call') {
          const call = params[0] as {to?:string; data?:string} | undefined;
          if (!call || !addr(call.to) || !hexData(call.data)) throw new Error('RPC call rejected');
          const callTo = String(call.to).toLowerCase();
          if (![OCH, VAULT, ENGINE].includes(callTo)) throw new Error('RPC call rejected');
          const sel = String(call.data).slice(0,10).toLowerCase();
          const allowed = callTo === OCH ? ['0xdd62ed3e'] :
            callTo === VAULT ? ['0x6d3fac54'] : ['0x0942d170'];
          if (!allowed.includes(sel)) throw new Error('RPC selector rejected');
        }
        if (method === 'eth_getTransactionReceipt' &&
            (params.length !== 1 || !hex(params[0]) || (params[0] as string).length !== 66))
          throw new Error('Invalid transaction hash');
        if (method === 'eth_sendTransaction') {
          const tx = params[0] as {to?:string; from?:string; data?:string; value?:string} | undefined;
          if (params.length !== 1 || !tx || !addr(tx.from) || !addr(tx.to) || !hexData(tx.data) ||
              (tx.value !== undefined && bigint(tx.value) !== BigInt(0))) throw new Error('Transaction rejected');
          const actualChain = await provider.request({method:'eth_chainId'});
          if (typeof actualChain !== 'string' || actualChain.toLowerCase() !== CHAIN)
            throw new Error('Switch wallet to Robinhood Chain first');
          const accounts = await provider.request({method:'eth_accounts'});
          if (!Array.isArray(accounts) || !accounts.some(a => typeof a === 'string' && a.toLowerCase() === tx.from!.toLowerCase()))
            throw new Error('Connect the requested wallet before sending');
          const data = tx.data!.toLowerCase();
          const to = String(tx.to).toLowerCase();
          const arg = (start: number) => data.slice(start, start+64);
          const maxEntry = BigInt('100000000000000000000');
          if (to === OCH) {
            if (data.length !== 138 || !data.startsWith('0x095ea7b3') ||
                bigint('0x' + arg(10)) !== bigint(VAULT) || bigint('0x' + arg(74)) !== maxEntry)
              throw new Error('Only 100 OCH allowance to ArcadeVault is permitted');
          } else if (to === VAULT) {
            if (data.startsWith('0xe5ed1d59')) {
              if (data.length !== 74 || bigint('0x' + arg(10)) !== targetId)
                throw new Error('Wrong ArcadeMachine token ID');
            } else if (data.startsWith('0xec517287')) {
              if (data.length < 202 || data.length > 30000 ||
                  bigint('0x' + arg(74)) !== BigInt(64)) throw new Error('Invalid claim call');
            } else throw new Error('Only ArcadeVault game transactions are permitted');
          } else throw new Error('Transaction target not permitted');
        }
        const result = await provider.request({method, params});
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
          if (Array.isArray(result)) connectedAccount.current = typeof result[0] === 'string' ? result[0] : null;
        }
        send(result);
      } catch (err) {
        const e = err as {code?:number; message?:string};
        send(undefined, {code: typeof e.code === 'number' ? e.code : -32000, message:e.message || 'Wallet request failed'});
      }
    };
    window.addEventListener('message', listener);
    return () => {
      active = false;
      window.removeEventListener('message', listener);
      provider?.removeListener?.('accountsChanged', onAccounts);
      provider?.removeListener?.('chainChanged', onChain);
    };
  }, [arcadeDocument, isArcade, tokenId]);

  const mediaRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Keep fullscreen state synchronized, including when ESC is pressed.
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(
        document.fullscreenElement === mediaRef.current
      );
    };

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      );
    };
  }, []);

  async function openFullscreen() {
    const node = mediaRef.current;
    if (!node) return;

    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen();
      } else if (node.requestFullscreen) {
        await node.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen request failed:', error);
    }
  }

  return (
    <div className="mb-token-media-shell">
      <div className="mb-token-media-controls">
        <div
          className="mb-token-media-tabs"
          role="group"
          aria-label="Token media"
        >
          <button
            type="button"
            onClick={() => setMode('image')}
            aria-pressed={mode === 'image'}
            disabled={!image}
            className={mode === 'image' ? 'active' : ''}
          >
            <ImageIcon size={14} />
            IMAGE
          </button>

          {playable && (
            <button
              type="button"
              onClick={() => setMode('animation')}
              aria-pressed={mode === 'animation'}
              className={mode === 'animation' ? 'active' : ''}
            >
              <Play size={14} />
              ANIMATION
            </button>
          )}
        </div>

        <button
          type="button"
          className="mb-token-media-fullscreen"
          onClick={openFullscreen}
          aria-label="Fullscreen media"
          title="Fullscreen"
        >
          <Expand size={18} />
        </button>
      </div>

      <div
        ref={mediaRef}
        className="mb-token-media-stage"
      >
        {playable && mode === 'animation' ? (
          <iframe
            key={animationUrl}
            title={`${name} interactive animation`}
            ref={iframeRef}
            {...(arcadeDocument ? { srcDoc: arcadeDocument } : { src: animationUrl! })}
            sandbox="allow-scripts"
            allow="fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        ) : image ? (
          <img src={image} alt={name} />
        ) : (
          <span>NO IMAGE</span>
        )}

        {fullscreen && (
          <button
            className="mb-token-media-exit"
            type="button"
            onClick={openFullscreen}
          >
            EXIT FULLSCREEN ×
          </button>
        )}
      </div>

      <style jsx>{`
        .mb-token-media-shell {
          width: 100%;
          max-width: 650px;
          min-width: 0;
        }

        .mb-token-media-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }

        .mb-token-media-tabs {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .mb-token-media-controls button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 12px;
          border: 1px solid currentColor;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          background: transparent;
          color: inherit;
        }

        .mb-token-media-controls button.active {
          color: #111;
          background: #ceff45;
        }

        .mb-token-media-controls button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .mb-token-media-stage {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #e8e9e3;
          color: #111;
        }

        .mb-token-media-stage img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          image-rendering: pixelated;
        }

        .mb-token-media-stage iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          background: #000;
        }

        .mb-token-media-stage:fullscreen {
          width: 100vw;
          height: 100vh;
          aspect-ratio: auto;
          background: #000;
        }

        .mb-token-media-stage:fullscreen img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .mb-token-media-exit {
          position: absolute;
          z-index: 2;
          top: 12px;
          right: 12px;
          padding: 9px 12px;
          border: 1px solid #fff;
          background: #000;
          color: #fff;
          font-weight: bold;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
