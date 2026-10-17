import { createRequire } from "node:module";
const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("@playwright/test");
const [, , L, idsJson] = process.argv;
const ids = JSON.parse(idsJson);
const PW = process.env.DEMO_PASSWORD;
if (!PW)
  throw new Error("Set DEMO_PASSWORD to the demo accounts password (docs/DEMO_ENVIRONMENT.md)");
const B = "http://localhost:3000",
  S = 1080 / 390;
const fmt = (d) => d.toISOString().slice(0, 10);
const dates = `pickupDate=${fmt(new Date(Date.now() + 10 * 864e5))}&pickupTime=09:00&returnDate=${fmt(new Date(Date.now() + 13 * 864e5))}&returnTime=09:00`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const res = {};
async function y(ctx, url, sel, key) {
  const p = await ctx.newPage();
  await p.goto(`${B}/${L}${url}`, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: `p[role="note"]{display:none!important}` });
  await p.evaluate(() =>
    document.querySelectorAll('[role="status"]').forEach((el) => {
      if (/MFA/.test(el.textContent ?? "")) el.remove();
    }),
  );
  res[key] = await p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.top + scrollY), Math.round(r.bottom + scrollY)];
  }, sel);
  res[key] = res[key]?.map((v) => Math.round(v * S));
  await p.close();
}
const ctx = await browser.newContext({
  viewport: { width: 390, height: 694 },
  deviceScaleFactor: S,
  isMobile: true,
});
await y(ctx, `/cars?${dates}`, "main ul li", "catalogueFirst");
await y(ctx, `/cars?${dates}`, "main ul", "catalogueList");
await y(ctx, `/cars/${ids.prado}?${dates}&drive=self`, "h1", "detailH1");
await y(ctx, `/cars/${ids.prado}?${dates}&drive=self`, "aside, [class*='sticky']", "detailAside");
const login = async (email) => {
  const c = await browser.newContext({
    viewport: { width: 390, height: 694 },
    deviceScaleFactor: S,
    isMobile: true,
  });
  await c.request.post(`${B}/api/auth/sign-in/email`, {
    data: { email, password: PW },
    headers: { origin: B },
  });
  return c;
};
const admin = await login("demo.superadmin@ridekmer.test");
await y(admin, "/admin", "#admin-overview", "adminOverview");
const p2 = await admin.newPage();
await p2.goto(`${B}/${L}/cars/${ids.prado}?${dates}&drive=self`, { waitUntil: "networkidle" });
res.priceDetail = await p2.evaluate(() => {
  const h = [...document.querySelectorAll("h2,h3,p,span,div")].find(
    (e) =>
      /Détail du prix|Price breakdown|Price details/i.test(e.textContent ?? "") &&
      e.children.length === 0,
  );
  if (!h) return null;
  const r = h.getBoundingClientRect();
  return Math.round((r.top + scrollY) * (1080 / 390));
});
console.info(JSON.stringify(res));
await browser.close();
