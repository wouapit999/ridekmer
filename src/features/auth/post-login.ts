"use client";

/**
 * Where to send someone right after a successful sign-in. An explicit, same-site `returnTo`
 * wins; otherwise staff go to the administration (which itself sends them to the security
 * page when two-factor authentication still has to be enabled) and everyone else to their
 * account. A failed lookup falls back to the account page.
 */
export async function postLoginDestination(returnTo?: string | null): Promise<string> {
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  try {
    const res = await fetch("/api/account/viewer", { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { viewer: { isStaff?: boolean } | null };
      if (body.viewer?.isStaff) return "/admin";
    }
  } catch {
    // network hiccup: the account page is always a safe landing place
  }
  return "/account";
}
