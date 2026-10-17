// Renders the branded intro, outro, credits and caption overlays for the video.
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("@playwright/test");

const [, , out, L, url] = process.argv;
const copy = JSON.parse(await readFile(new URL("./copy.json", import.meta.url), "utf8"))[L];
const credits = JSON.parse(
  await readFile(`${process.cwd()}/prisma/seed-data/showcase-photos/credits.json`, "utf8"),
);
await mkdir(out, { recursive: true });

const logo = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#136843"/><path d="M14 46c10-4 14-14 18-22s10-14 18-10" stroke="#f9bc45" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="46" cy="44" r="6" fill="#fff"/><circle cx="20" cy="20" r="4" fill="#fff"/></svg>`;
const base = `*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;font-family:Inter,'Inter Display',sans-serif;-webkit-font-smoothing:antialiased}`;
const green = `background:radial-gradient(120% 80% at 50% 0%,#1f7f54 0%,#136843 45%,#0b3f29 100%);color:#fff`;
const word = `<span style="font-weight:800;letter-spacing:-2px">Ride<span style="color:#f9bc45">Kmer</span></span>`;
const badgeLogo = (s) =>
  `<div style="background:#fff;border-radius:${s * 0.3}px;padding:${s * 0.08}px;display:inline-flex;box-shadow:0 20px 60px rgba(0,0,0,.25)">${logo(s)}</div>`;

const pages = {
  intro: `<style>${base}</style><body style="${green};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 80px">
    ${badgeLogo(220)}
    <div style="font-size:120px;margin-top:60px">${word}</div>
    <div style="font-size:70px;font-weight:700;line-height:1.15;margin-top:70px">${copy.intro.title}</div>
    <div style="font-size:40px;font-weight:500;opacity:.85;margin-top:50px">${copy.intro.sub}</div></body>`,
  outro: `<style>${base}</style><body style="${green};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 70px">
    ${badgeLogo(180)}
    <div style="font-size:110px;margin-top:50px">${word}</div>
    <div style="font-size:64px;font-weight:700;margin-top:90px">${copy.outro.cta}</div>
    <div style="margin-top:40px;background:#fff;color:#0f5336;font-size:58px;font-weight:800;padding:34px 56px;border-radius:999px;box-shadow:0 20px 60px rgba(0,0,0,.25)">${url}</div>
    <div style="font-size:46px;font-weight:600;margin-top:80px;color:#f9bc45">${copy.outro.owners}</div>
    <div style="position:absolute;bottom:90px;left:0;right:0;font-size:28px;opacity:.75">${copy.outro.note}</div></body>`,
  credits: `<style>${base}</style><body style="background:#faf8f5;color:#1e1b19;padding:150px 80px">
    <div style="font-size:44px;font-weight:700;color:#136843">${copy.credits}</div>
    <ul style="list-style:none;margin-top:50px;font-size:31px;line-height:1.35">
    ${credits.map((c) => `<li style="margin-top:26px"><b>${c.model}</b><br><span style="color:#5b544e">${c.author ?? "—"} · ${c.license}</span></li>`).join("")}
    </ul></body>`,
};

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [name, html] of Object.entries(pages)) {
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${name}.png` });
}
for (const [key, text] of Object.entries(copy.captions)) {
  await page.setContent(`<style>${base}body{background:transparent;display:flex;align-items:flex-end;justify-content:center;padding-bottom:150px}</style>
    <div id="c" style="max-width:960px;background:rgba(15,83,54,.94);color:#fff;font-size:58px;font-weight:700;line-height:1.2;text-align:center;padding:34px 54px;border-radius:44px;box-shadow:0 18px 50px rgba(0,0,0,.28)">${text}</div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#c").screenshot({ path: `${out}/cap-${key}.png`, omitBackground: true });
  const box = await page.locator("#c").boundingBox();
  console.info(key, Math.round(box.y));
}
await browser.close();
