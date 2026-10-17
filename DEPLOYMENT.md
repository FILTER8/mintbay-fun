# Mintbay.fun: controlled first-release checklist

## 1. Prepare and push the project

Extract this repository's files into the local `mintbay-fun` checkout. Do not upload `.env.local`.

```bash
npm install
npm run lint
npx tsc --noEmit
npm run build
git status
git add .
git commit -m "Prepare mintbay.fun V2 for Vercel"
git push -u origin main
```

Only push after the commands actually pass. `npm audit` separately to review vulnerabilities; do not run `npm audit fix --force` blindly.

## 2. Import into Vercel

- Vercel > Add New Project > Import `FILTER8/mintbay-fun`.
- Framework: Next.js; root directory: repo root.
- Set environment variables in Project > Settings > Environment Variables.
  - `ALCHEMY_API_KEY` (optional, server-only).
  - `MINTBAY_API_BASE_URL=https://api.mintbay.xyz` (until migration).
  - `NEXT_PUBLIC_MINTBAY_API_BASE_URL=https://api.mintbay.xyz` (public health link).
  - `MINTBAY_STUDIO_PUBLISH_PASSWORD` and `MINTBAY_BUILD_UPLOAD_TOKEN` (server-only; use strong distinct secrets).
- Deploy to a `.vercel.app` preview URL first; test `/`, `/studio`, `/manual`, `/collections`, `/profile`, wallet connection and native RPC read operations.
- Publish a throwaway Studio build only after checking access code, Worker auth and Cloudflare limits; publishing does NOT deploy contracts.

## 3. Point the purchased domain to Vercel

- In Vercel Project > Settings > Domains, add `mintbay.fun` and `www.mintbay.fun`.
- In the registrar's DNS UI (shown in the screenshot, currently parked/inactive), replace the parked apex A record with the A/ALIAS target **Vercel shows for your project**. Add the exact `www` CNAME Vercel specifies. Do not remove NS, MX or TXT records blindly.
- Wait for Vercel verification and HTTPS before setting the production URL in other services. Keep `mintbay.xyz` unchanged.
- Do not replace GoDaddy nameservers just to point a website to Vercel; only do so if deliberately moving authoritative DNS.

## 4. Cloudflare Worker hostname

- Keep `api.mintbay.xyz` serving existing immutable build IDs and hashes indefinitely.
- Add `api.mintbay.fun` as an additional Worker custom domain (on a Cloudflare-managed zone) or an equivalent verified routing setup; do not cut over the old host.
- Check `/health`, `/v1/builds/<known-id>`, `config.json`, `artwork.json`, `compiled-artwork.json`, response headers and SHA-256 parity across both hosts.
- Change the two Vercel environment URLs to `https://api.mintbay.fun`, then redeploy Vercel.
- Do not expose `MINTBAY_BUILD_UPLOAD_TOKEN` to client JavaScript.

## 5. Fee-wallet migration: contract and skill must agree

**New recipient requested for NEW collections:** `0xcdb9DB46d6C251A334EfF599012011Dc63ff5717`

- This is a change to the on-chain protocol, not a website variable. In the **new** canonical Solidity base, replace the old `PLATFORM_FEE_RECIPIENT` hardcoded constant; retain fee rate `PLATFORM_FEE_BPS = 500` and protected pull withdrawals.
- Recompile and recheck resulting Solidity source hash, source verification, protocol fee accounting, and Bankr skill instruction. Do not claim the old pinned base remains identical.
- Previously deployed contracts with a hardcoded recipient do not change.
- Only after validation, update Mintbay agent `references/PROTOCOL-RULES.md`, `SKILL.md`, examples, tests and any pinned-base checksum; then test Bankr again with the changed recipient.
- Do NOT deploy contracts or move funds as part of this frontend release.

## 6. Deployment with Bankr

- Verify trusted publisher, source hashes, chain ID, owner, payout wallet and royalty wallet against the immutable build.
- Confirm destination chain, gas costs, bytecode source and the NEW hardcoded 5% fee recipient before approving any live transaction.
- No off-chain prompt can make copying public CC0 builds cryptographically impossible. Clearly identify the canonical deployed contract.
