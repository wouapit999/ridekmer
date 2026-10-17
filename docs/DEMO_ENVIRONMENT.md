# Demo environment (sample data)

The production site never contains demo or sample data. To show how RideKmer works with
realistic content, run a **separate demo site** with its own database. It costs nothing on
the free Neon and Vercel plans and takes about 15 minutes to set up once.

## What the demo data contains

`pnpm db:seed` with `ALLOW_DEMO_SEED=true` outside production loads:

- the demo staff accounts (`demo.superadmin@ridekmer.test`, `demo.admin@…`, `demo.ops@…`,
  `demo.finance@…`, `demo.fleet@…`, `demo.inspector@…`, `demo.support@…`), a demo owner,
  customer and chauffeur, and 3 demo vehicles (`prisma/seed-data/demo.ts`);
- the **showcase** (`prisma/seed-data/showcase.ts`): 10 sample listings in Douala, Yaoundé,
  Kribi, Limbé and Bafoussam (Corolla, Land Cruiser Prado, Tucson, Hilux, Swift, E-Class,
  RAV4, HiAce, X-Trail, Accent), 3 owners, 4 verified customers and 7 bookings (completed,
  in progress, confirmed, awaiting payment, cancelled) with their payments.

Every name ends with "(exemple)", e-mails use `.test`, plates start with `EX-`, payments are
marked sandbox. All accounts use the password `RideKmer-Demo-2026!`. Photos are free-licence
pictures of each model from Wikimedia Commons; each listing credits its photo
(`public/showcase/CREDITS.md`).

| To see            | Sign in as                          |
| ----------------- | ----------------------------------- |
| Administration    | `demo.superadmin@ridekmer.test`     |
| Owner space       | `showcase.owner.paul@ridekmer.test` |
| Customer bookings | `showcase.jean@ridekmer.test`       |

## Sample cars on any site (administration button)

Without a separate demo site, an administrator can open **Administration → Sample cars** and add
the 10 sample listings (cars only, badged "Example", not bookable), then remove them in one
click. See ADR-041.

## One-time setup

1. **Database.** In Neon, open the RideKmer project → **Databases** → **New database**, name it
   `ridekmer_demo`. Do not use a branch of production: a branch copies real accounts. Copy two
   connection strings for `ridekmer_demo`: the **pooled** one and the **direct** one (Pooled
   connection switched off).
2. **GitHub secret.** Repository → Settings → Secrets and variables → Actions → New secret
   `DEMO_DATABASE_URL` = the direct string. Never paste it anywhere else.
3. **Load the data.** Actions → **Demo data** → Run workflow. It refuses to run if the secret
   points at the production database.
4. **Second Vercel project.** Vercel → Add New → Project → import `wouapit999/ridekmer` again,
   name it `ridekmer-demo`, Production Branch `develop` (Settings → Git). Environment variables:

   | Name                                                             | Value                                                          |
   | ---------------------------------------------------------------- | -------------------------------------------------------------- |
   | `APP_ENV`                                                        | `preview` (shows the "demonstration" banner)                   |
   | `DATABASE_URL`                                                   | pooled `ridekmer_demo` string                                  |
   | `DIRECT_DATABASE_URL`                                            | direct `ridekmer_demo` string                                  |
   | `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS` | `https://ridekmer-demo.vercel.app` (type Config for the first) |
   | `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`        | **new** random values, different from production               |
   | `EMAIL_PROVIDER`                                                 | `log` (the demo never sends real e-mails)                      |
   | `AUTH_REQUIRE_STAFF_MFA`                                         | `false` (demo staff can open the admin without TOTP)           |

   Deploy. Sign in with the accounts above.

5. **Photos (optional).** Without storage the demo shows each model's illustrative photo from
   Wikimedia Commons. To show the sample photos as listing photos, create a Blob store on the
   demo project (Storage → Blob), add `STORAGE_PROVIDER=vercel-blob` there, copy its
   `BLOB_READ_WRITE_TOKEN` into the GitHub secret `DEMO_BLOB_READ_WRITE_TOKEN`, and run
   **Demo data** again.

Running **Demo data** again is safe: existing records are kept and only missing ones are added.

## Local

```bash
ALLOW_DEMO_SEED=true pnpm db:seed   # APP_ENV must not be production
```
