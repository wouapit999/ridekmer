// Renders the RideKmer SVG mark into the PNG sizes required for PWA installation.
// Usage: node scripts/generate-icons.mjs (requires the pre-installed Playwright Chromium).
import { readFile, writeFile } from "node:fs/promises";

import { chromium } from "@playwright/test";

const targets = [
  { src: "public/icons/icon.svg", out: "public/icons/icon-192.png", size: 192 },
  { src: "public/icons/icon.svg", out: "public/icons/icon-512.png", size: 512 },
  { src: "public/icons/icon.svg", out: "public/icons/apple-touch-icon.png", size: 180 },
  { src: "public/icons/icon-maskable.svg", out: "public/icons/icon-maskable-512.png", size: 512 },
];

// The session/CI may pin a Chromium outside Playwright's cache (PLAYWRIGHT_CHROMIUM_EXECUTABLE).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
for (const t of targets) {
  const svg = await readFile(t.src, "utf8");
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace(/width="64" height="64"/, `width="${t.size}" height="${t.size}"`)}</body></html>`,
  );
  const buffer = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: t.size, height: t.size },
  });
  await writeFile(t.out, buffer);
  console.info(`wrote ${t.out}`);
}
await browser.close();
