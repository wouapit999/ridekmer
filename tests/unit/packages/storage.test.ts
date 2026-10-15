import { describe, expect, it } from "vitest";

import { MemoryStorageProvider, buildObjectKey, validateFile } from "@ridekmer/storage";

const rule = { allowedMimeTypes: ["image/jpeg", "application/pdf"], maxSizeBytes: 1024 };

describe("file validation", () => {
  it("accepts a real JPEG signature", () => {
    expect(
      validateFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]), "image/jpeg", rule),
    ).toBeNull();
  });
  it("rejects mismatched content, disallowed types and oversized files", () => {
    expect(validateFile(new Uint8Array([0x00, 0x01]), "image/jpeg", rule)?.code).toBe(
      "CONTENT_MISMATCH",
    );
    expect(validateFile(new Uint8Array([0xff, 0xd8, 0xff]), "image/gif", rule)?.code).toBe(
      "MIME_NOT_ALLOWED",
    );
    expect(validateFile(new Uint8Array(2048), "application/pdf", rule)?.code).toBe("TOO_LARGE");
    expect(validateFile(new Uint8Array(0), "application/pdf", rule)?.code).toBe("EMPTY");
  });
  it("builds traversal-safe keys", () => {
    expect(
      buildObjectKey({
        scope: "vehicle-docs",
        entityId: "../etc",
        fileId: "abc",
        extension: "pdf",
      }),
    ).toBe("vehicle-docs/etc/abc.pdf");
  });
  it("stores objects with checksums", async () => {
    const s = new MemoryStorageProvider();
    const r = await s.put({
      key: "a/b.pdf",
      body: Buffer.from("%PDF-1.4"),
      contentType: "application/pdf",
    });
    expect(r.checksumSha256).toHaveLength(64);
    expect(await s.exists("a/b.pdf")).toBe(true);
  });
});
