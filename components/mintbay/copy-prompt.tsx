"use client";export function CopyPrompt({text}:{text:string}){return <button className="btn btn-outline" onClick={()=>navigator.clipboard.writeText(text)}>COPY PROMPT ↗</button>}
