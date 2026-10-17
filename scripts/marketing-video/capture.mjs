// Captures the RideKmer screens for the marketing video on a phone viewport.
// Usage: node capture.mjs <outDir> <locale fr|en> <idsJson>
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("@playwright/test");

const [, , out, L, idsJson] = process.argv;
const ids = JSON.parse(idsJson);
const B = "http://localhost:3000";
const SCALE = 1080 / 390;
const PW = process.env.DEMO_PASSWORD;
if (!PW)
  throw new Error("Set DEMO_PASSWORD to the demo accounts password (docs/DEMO_ENVIRONMENT.md)");
await mkdir(out, { recursive: true });

const fmt = (d) => d.toISOString().slice(0, 10);
const pick = new Date(Date.now() + 10 * 864e5);
const ret = new Date(Date.now() + 13 * 864e5);
const dates = `pickupDate=${fmt(pick)}&pickupTime=09:00&returnDate=${fmt(ret)}&returnTime=09:00`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: [`--lang=${L === "fr" ? "fr-FR" : "en-GB"}`],
  env: {
    ...process.env,
    LANG: L === "fr" ? "fr_FR.UTF-8" : "en_GB.UTF-8",
    LANGUAGE: L === "fr" ? "fr" : "en_GB",
  },
});
async function ctxFor(email) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 694 },
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    locale: L === "fr" ? "fr-FR" : "en-GB",
    timezoneId: "Africa/Douala",
  });
  if (email) {
    const r = await ctx.request.post(`${B}/api/auth/sign-in/email`, {
      data: { email, password: PW },
      headers: { origin: B },
    });
    if (!r.ok()) throw new Error(`login ${email}: ${r.status()}`);
  }
  const page = await ctx.newPage();
  return { ctx, page };
}
async function prep(page) {
  // The "demonstration" strip is for testers of the demo site; the video states it uses sample data.
  await page.addStyleTag({
    content: `p[role="note"]{display:none!important} nextjs-portal{display:none!important} main#main > div > div[role="status"]{display:none!important}`,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
async function shot(page, url, name, opts = {}) {
  await page.goto(`${B}/${L}${url}`, { waitUntil: "networkidle" });
  await prep(page);
  if (opts.before) await opts.before(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: Boolean(opts.full) });
  console.info("captured", name);
}

// Visitor
{
  const { ctx, page } = await ctxFor(null);
  await shot(page, "", "01-home");
  await shot(page, "", "02-search", {
    before: async (p) => {
      await p.locator("#city").selectOption("douala");
      await p.locator('input[name="pickupDate"]').fill(fmt(pick));
      await p.locator('input[name="returnDate"]').fill(fmt(ret));
      await p.locator("#city").scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, -120));
      await p.evaluate(() => document.activeElement?.blur?.());
      await p.waitForTimeout(300);
    },
  });
  await shot(page, `/cars?${dates}`, "03-catalogue", { full: true });
  await shot(page, `/cars/${ids.prado}?${dates}&drive=self`, "04-detail", { full: true });
  await shot(page, `/cars/${ids.hiace}?${dates}&drive=chauffeur`, "05-chauffeur");
  await shot(page, "/partner", "08-partner");
  await ctx.close();
}
// Customer
{
  const { ctx, page } = await ctxFor("showcase.jean@ridekmer.test");
  await shot(page, "/account/bookings", "06-bookings", { full: true });
  await ctx.close();
}
// Owner
{
  const { ctx, page } = await ctxFor("showcase.owner.paul@ridekmer.test");
  await shot(page, "/owner/vehicles", "09-owner", { full: true });
  // This machine cannot reach Wikipedia: answer the preview lookup with the same free-licence
  // Commons photo production would find, served from the local copy.
  const credits = JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile(`${process.cwd()}/prisma/seed-data/showcase-photos/credits.json`, "utf8"),
  );
  const prado = credits.find((c) => c.slug === "toyota-land-cruiser-prado");
  await page.route("**/api/vehicles/reference-image**", (route) =>
    route.fulfill({
      json: {
        image: {
          url: "https://upload.wikimedia.org/showcase/prado.jpg",
          sourcePageUrl: prado.source,
          author: prado.author,
          license: prado.license,
        },
      },
    }),
  );
  await page.route("https://upload.wikimedia.org/**", (route) =>
    route.fulfill({
      path: `${process.cwd()}/prisma/seed-data/showcase-photos/toyota-land-cruiser-prado.jpg`,
      contentType: "image/jpeg",
    }),
  );
  await shot(page, "/owner/vehicles/new", "10-owner-form", {
    before: async (p) => {
      await p.locator("#makeChoice").selectOption("Toyota");
      await p.locator("#modelChoice").selectOption("Land Cruiser Prado");
      await p.locator('input[name="registrationNumber"]').fill("LT 482 KM");
      await p.locator('input[name="manufacturingYear"]').fill("2023");
      await p.locator("#makeChoice").scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, 150));
      await p.waitForTimeout(1500);
    },
  });
  await ctx.close();
}
// Administration
{
  const { ctx, page } = await ctxFor("demo.superadmin@ridekmer.test");
  await shot(page, "/admin", "11-admin", {
    full: true,
    before: async (p) => {
      // Development-only notice ("MFA enforcement disabled") is not part of the real product.
      await p.evaluate(() =>
        document.querySelectorAll('[role="status"]').forEach((el) => {
          if (/MFA/.test(el.textContent ?? "")) el.remove();
        }),
      );
    },
  });
  await ctx.close();
}
await browser.close();
