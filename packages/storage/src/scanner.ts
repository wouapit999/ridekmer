import type { MalwareScanner, MalwareScanResult } from "./types";

/** No-op scanner used until a scanning service is configured; marks results as skipped. */
export class NoopMalwareScanner implements MalwareScanner {
  readonly name = "none";
  async scan(): Promise<MalwareScanResult> {
    return { clean: true, engine: this.name, skipped: true };
  }
}
