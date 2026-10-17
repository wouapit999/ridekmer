import { describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ head: vi.fn() }));

vi.mock("@vercel/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vercel/blob")>()),
  head: blob.head,
}));

import { BlobNotFoundError, BlobStoreNotFoundError } from "@vercel/blob";

import { VercelBlobStorageProvider } from "@ridekmer/storage";

describe("VercelBlobStorageProvider.exists", () => {
  const provider = new VercelBlobStorageProvider({});

  it("treats a missing object as absent", async () => {
    blob.head.mockRejectedValueOnce(new BlobNotFoundError());
    await expect(provider.exists("health/probe")).resolves.toBe(false);
  });

  it("surfaces credential and store errors", async () => {
    blob.head.mockRejectedValueOnce(new BlobStoreNotFoundError());
    await expect(provider.exists("health/probe")).rejects.toBeInstanceOf(BlobStoreNotFoundError);
  });

  it("uses OIDC when no token is configured", async () => {
    blob.head.mockResolvedValueOnce({});
    await expect(provider.exists("kyc/a.pdf")).resolves.toBe(true);
    expect(blob.head).toHaveBeenLastCalledWith("kyc/a.pdf", { token: undefined });
  });
});
