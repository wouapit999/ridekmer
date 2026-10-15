import {
  GenericRestTrackingProvider,
  MockTrackingProvider,
  TrackingProviderError,
  type TrackingProvider,
} from "@ridekmer/tracking";

import { getEnv } from "@/lib/env";

/** Public webhook slugs: the mock shares the real slug so a vendor URL never changes. */
export const GPS_WEBHOOK_SLUGS = ["generic"] as const;

const globalRegistry = globalThis as unknown as { __ridekmerTracking?: TrackingProvider };

function isProduction() {
  const env = getEnv();
  return env.NODE_ENV === "production" && env.APP_ENV === "production";
}

/** Resolve the telematics provider from the environment. Mock is refused in production. */
export function getTrackingProvider(): TrackingProvider {
  if (globalRegistry.__ridekmerTracking) return globalRegistry.__ridekmerTracking;
  const env = getEnv();
  let provider: TrackingProvider;
  if (env.GPS_PROVIDER === "mock") {
    if (isProduction())
      throw new TrackingProviderError(
        "NOT_CONFIGURED",
        "GPS_PROVIDER=mock is not allowed in production",
      );
    provider = new MockTrackingProvider(env.GPS_WEBHOOK_SECRET ?? "mock-gps-dev-secret");
  } else {
    provider = new GenericRestTrackingProvider({
      environment: env.APP_ENV === "production" ? "production" : "sandbox",
      baseUrl: env.GPS_PROVIDER_BASE_URL,
      apiKey: env.GPS_PROVIDER_API_KEY,
      webhookSecret: env.GPS_WEBHOOK_SECRET,
    });
  }
  globalRegistry.__ridekmerTracking = provider;
  return provider;
}

export function resetTrackingProviderForTests(provider?: TrackingProvider) {
  globalRegistry.__ridekmerTracking = provider;
}
