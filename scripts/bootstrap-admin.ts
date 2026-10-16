/**
 * Create the first super administrator from a terminal (docs/OPERATIONS_RUNBOOK.md).
 *
 *   pnpm admin:bootstrap --email support@example.com [--name "Support RideKmer"] [--locale fr] [--reseed]
 *
 * Needs DATABASE_URL (or DIRECT_DATABASE_URL) plus the usual application variables
 * (BETTER_AUTH_SECRET, APP_ENCRYPTION_KEY, NEXT_PUBLIC_APP_URL …), e.g. from `.env`.
 * With EMAIL_PROVIDER=resend/smtp the temporary password is e-mailed; otherwise it is
 * printed once here and nowhere else. The same logic backs `POST /api/admin/bootstrap`.
 */
/* eslint-disable no-console */
import "dotenv/config";

if (process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = arg("email") ?? process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) {
    console.error("Usage: pnpm admin:bootstrap --email <address> [--name <name>] [--locale fr|en]");
    process.exit(2);
  }
  const locale = arg("locale") === "en" ? "en" : "fr";
  const { bootstrapSuperAdmin } = await import("../src/server/auth/bootstrap-admin");
  const result = await bootstrapSuperAdmin({
    email,
    name: arg("name"),
    locale,
    reseed: process.argv.includes("--reseed"),
  });
  switch (result.outcome) {
    case "already_configured":
      console.log(`A super administrator already exists (${result.email}); nothing changed.`);
      console.log("Grant further roles from Administration → Users.");
      break;
    case "role_granted":
      console.log(`Super administrator role granted to the existing account ${result.email}.`);
      console.log(`Notice sent via "${result.delivery}". Sign in with the usual password.`);
      break;
    case "created":
      console.log(`Super administrator ${result.email} created.`);
      if (result.temporaryPassword) {
        console.log("No e-mail provider is configured, so the temporary password is shown ONCE:");
        console.log(`  ${result.temporaryPassword}`);
        console.log("Change it at first sign-in and enable TOTP (Account → Security).");
      } else {
        console.log(`Temporary password sent via "${result.delivery}". Check that mailbox.`);
      }
      break;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
