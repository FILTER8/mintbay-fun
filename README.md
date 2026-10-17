# Mintbay.fun — V2 frontend

Playful CC0 fully-on-chain generative NFT Studio, built with Next.js and a wallet-connected six-chain interface. Current UI routes: `/`, `/collections`, `/studio`, `/profile`, `/manual`. The original Pixel Studio is integrated at `/studio`.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

For a production readiness check run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before pushing.

See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub, Vercel, registrar DNS, Cloudflare API host migration and the **new protocol fee recipient** migration checklist. The new fee address must be hardcoded into the future **Solidity** candidate and skill: changing frontend configuration cannot change an immutable deployed fee recipient.

## Networks

Robinhood (4663), Base (8453), Ethereum (1), Polygon (137), Unichain (130), Arbitrum (42161). Alchemy key is optional and server-only; unsupported networks use configured public RPC fallbacks. Injected browser wallets only; no WalletConnect project ID required.

## Publishing

`POST /api/studio/builds` is a server-side proxy requiring `MINTBAY_STUDIO_PUBLISH_PASSWORD` and `MINTBAY_BUILD_UPLOAD_TOKEN`. If secrets are missing it returns 503; publishing is not enabled by default. Set `MINTBAY_API_BASE_URL` to select its verified upstream Worker URL. The public Studio health link is controlled independently by `NEXT_PUBLIC_MINTBAY_API_BASE_URL`. The default remains `https://api.mintbay.xyz` until `api.mintbay.fun` has been tested.

No blockchain deployments are initiated by this site. Publishing artwork does not deploy NFTs. CC0 publication should require the creator to confirm they own or control the rights needed to dedicate the artwork.
