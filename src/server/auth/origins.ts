/**
 * Origins allowed to call the authentication routes (CSRF protection in Better Auth).
 *
 * Besides the configured public URL and AUTH_TRUSTED_ORIGINS, the host's own deployment
 * addresses are trusted automatically: Vercel serves every deployment under generated
 * hostnames (`<project>-git-<branch>-<team>.vercel.app`, `<project>-<hash>.vercel.app`) and
 * exposes them as system variables. Without them, a tester who opens such a link gets
 * "Invalid origin" on sign-up and sign-in. Only exact hosts are added, never a wildcard.
 */
export function trustedOrigins(input: {
  appUrl: string;
  extra?: string | null;
  vercel?: {
    VERCEL_URL?: string;
    VERCEL_BRANCH_URL?: string;
    VERCEL_PROJECT_PRODUCTION_URL?: string;
  };
}): string[] {
  const origins = new Set<string>();
  const add = (value: string | undefined | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    origins.add(withScheme.replace(/\/+$/, ""));
  };
  add(input.appUrl);
  for (const item of input.extra?.split(",") ?? []) add(item);
  add(input.vercel?.VERCEL_URL);
  add(input.vercel?.VERCEL_BRANCH_URL);
  add(input.vercel?.VERCEL_PROJECT_PRODUCTION_URL);
  return [...origins];
}
