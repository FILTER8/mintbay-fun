import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const LIMIT = 5 * 1024 * 1024;
// Keep the existing API by default until the new Worker hostname is tested.
// Configure MINTBAY_API_BASE_URL on Vercel when api.mintbay.fun is ready.
const base = (process.env.MINTBAY_API_BASE_URL || "https://api.mintbay.xyz").replace(/\/$/, "");
const UPSTREAM = `${base}/v1/builds`;

function matchSecret(value: string, expected: string): boolean {
  if (!value || !expected) return false;
  const a = createHash("sha256").update(value).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const password = process.env.MINTBAY_STUDIO_PUBLISH_PASSWORD;
  const token = process.env.MINTBAY_BUILD_UPLOAD_TOKEN;
  if (!password || !token) {
    return NextResponse.json({ error: "Studio publishing is not configured" }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin publishing is not allowed" }, { status: 403 });
  }
  if (!matchSecret(request.headers.get("x-studio-password") || "", password)) {
    return NextResponse.json({ error: "Invalid publishing password" }, { status: 401 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
  }
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > LIMIT) return NextResponse.json({ error: "Build exceeds 5 MiB" }, { status: 413 });
  // Bounded stream read to reject oversized uploads before buffering all input.
  if (!request.body) return NextResponse.json({ error: "Missing request body" }, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); return NextResponse.json({ error: "Build exceeds 5 MiB" }, { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let index = 0;
  for (const part of chunks) { buffer.set(part, index); index += part.byteLength; }
  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: buffer,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const result: unknown = await upstream.json();
    return NextResponse.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Mintbay API temporarily unavailable" }, { status: 502 });
  }
}
