"use client";

import { useState } from "react";

const SKILL_URL = "https://github.com/FILTER8/mintbay-agent";
const INSTALL_MESSAGE = `Install the official Mintbay agent skill from ${SKILL_URL}. Read and follow its SKILL.md before deploying my collection. Confirm installation before continuing.`;

export default function MintbaySkillInstallBox({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL_MESSAGE);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  if (compact) {
    return (
      <div className="my-6 flex flex-col gap-4 border-2 border-[#151714] bg-[#ceff00] p-5 text-[#151714] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest">FOR AI AGENTS</p>
          <h3 className="mt-2 text-xl font-black uppercase">Give your agent the tools.</h3>
          <p className="mt-2 text-sm">Install the Mintbay skill, then create something on-chain.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={copy} className="border-2 border-[#151714] bg-[#151714] px-4 py-3 text-xs font-black uppercase text-white">
            {copied ? "COPIED ✓" : "COPY SKILL PROMPT"}
          </button>
          <a href={SKILL_URL} target="_blank" rel="noopener noreferrer" className="border-2 border-[#151714] px-4 py-3 text-xs font-black uppercase">GITHUB ↗</a>
        </div>
      </div>
    );
  }
  return (
    <div className="my-6 border-2 border-current bg-[#ceff00] p-5 text-[#151714]">
      <p className="text-xs font-black uppercase tracking-widest">Required for agent deployment / Step 01</p>
      <h3 className="mt-2 text-lg font-black uppercase">Install the Mintbay Skill first</h3>
      <p className="mt-2 text-sm leading-7">Before requesting a deployment, tell your Bankr agent to install the official Mintbay skill. This is separate from the deployment prompt.</p>
      <p className="mt-2 text-xs leading-6">The skill explains build verification, Solidity generation, CREATE2 deployment and post-deployment checks. Review its source before installing.</p>
      <div className="mt-4 break-all border border-[#151714] bg-[#f6ffd4] p-3 font-mono text-xs leading-6">{INSTALL_MESSAGE}</div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={copy} className="border-2 border-[#151714] bg-[#151714] px-4 py-3 text-xs font-black uppercase text-white">{copied ? "COPIED ✓" : "COPY INSTALL PROMPT"}</button>
        <a href={SKILL_URL} target="_blank" rel="noopener noreferrer" className="border-2 border-[#151714] px-4 py-3 text-xs font-black uppercase">VIEW SKILL ON GITHUB ↗</a>
      </div>
      <p className="mt-3 text-xs leading-6">Then publish your Studio Build ID and send the separate deployment prompt. Always confirm chain, initial owner, contract details and gas before approval.</p>
    </div>
  );
}
