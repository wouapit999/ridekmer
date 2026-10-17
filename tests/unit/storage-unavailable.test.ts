import { describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getStorageProvider: vi.fn() }));

vi.mock("@/server/files/storage", () => ({
  getStorageProvider: storage.getStorageProvider,
  getMalwareScanner: () => ({ scan: async () => ({ clean: true }) }),
}));
vi.mock("@/server/audit", () => ({ recordAudit: vi.fn() }));

import {
  signedDownloadUrl,
  storageStatus,
  StorageUnavailableError,
  trySignedDownloadUrl,
} from "@/server/files/service";

const missingToken = () => {
  throw new Error("STORAGE_PROVIDER=vercel-blob requires BLOB_READ_WRITE_TOKEN");
};

describe("storage unavailable", () => {
  it("turns a misconfigured provider into StorageUnavailableError", async () => {
    storage.getStorageProvider.mockImplementation(missingToken);
    const error = await signedDownloadUrl({ storageKey: "kyc/a.pdf" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageUnavailableError);
    expect((error as StorageUnavailableError).code).toBe("STORAGE_UNAVAILABLE");
  });

  it("trySignedDownloadUrl returns null instead of throwing", async () => {
    storage.getStorageProvider.mockImplementation(missingToken);
    await expect(trySignedDownloadUrl({ storageKey: "kyc/a.pdf" })).resolves.toBeNull();
  });

  it("trySignedDownloadUrl returns the URL when storage works", async () => {
    storage.getStorageProvider.mockReturnValue({
      getSignedReadUrl: async (key: string) => `https://files.example/${key}`,
    });
    await expect(trySignedDownloadUrl({ storageKey: "kyc/a.pdf" })).resolves.toBe(
      "https://files.example/kyc/a.pdf",
    );
  });

  it("storageStatus reports whether the provider can be built", () => {
    storage.getStorageProvider.mockImplementation(missingToken);
    expect(storageStatus().ok).toBe(false);
    storage.getStorageProvider.mockReturnValue({});
    expect(storageStatus().ok).toBe(true);
  });
});
