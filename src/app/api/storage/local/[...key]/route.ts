import { LocalDiskStorageProvider } from "@ridekmer/storage";
import { NextResponse, type NextRequest } from "next/server";

import { getStorageProvider } from "@/server/files/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT ONLY: serves files from the local-disk storage provider after verifying the
 * HMAC signature embedded in the signed URL. Production uses the object-storage provider's
 * own presigned URLs and never hits this route.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ key: string[] }> }) {
  const provider = getStorageProvider();
  if (!(provider instanceof LocalDiskStorageProvider)) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
  const { key } = await context.params;
  const storageKey = key.join("/");
  const expires = Number(request.nextUrl.searchParams.get("expires") ?? 0);
  const sig = request.nextUrl.searchParams.get("sig") ?? "";
  if (!provider.verifySignature(storageKey, expires, sig)) {
    return NextResponse.json({ error: "invalid_or_expired_signature" }, { status: 403 });
  }
  const object = await provider.getObject(storageKey);
  if (!object) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const name = request.nextUrl.searchParams.get("name");
  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      "content-type": object.contentType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...(name ? { "content-disposition": `inline; filename="${name.replace(/"/g, "")}"` } : {}),
    },
  });
}
