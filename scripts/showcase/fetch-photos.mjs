// Downloads the lead free-licence (Creative Commons / public domain) photo of each showcase
// model from Wikimedia Commons, with author, licence and source page for the credits.
import { mkdir, writeFile } from "node:fs/promises";

const ALL = [
  ["toyota-corolla", "Toyota Corolla"],
  ["toyota-land-cruiser-prado", "Toyota Land Cruiser Prado"],
  ["hyundai-tucson", "Hyundai Tucson"],
  ["toyota-hilux", "Toyota Hilux"],
  ["suzuki-swift", "Suzuki Swift"],
  ["mercedes-benz-e-class", "Mercedes-Benz E-Class"],
  ["toyota-rav4", "Toyota RAV4"],
  ["toyota-hiace", "Toyota HiAce"],
  ["nissan-x-trail", "Nissan X-Trail"],
  ["hyundai-accent", "Hyundai Accent"],
];
const MODELS = ALL.filter(([slug]) => slug === "toyota-rav4");
const API = "https://en.wikipedia.org/w/api.php";
const UA = { "user-agent": "RideKmer showcase builder (+https://ridekmerw.vercel.app)" };
const FREE = /^(cc[\s-]|cc0|public domain|pd\b|pd-)/i;
const strip = (v) => (v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

await mkdir("showcase-photos", { recursive: true });
const credits = JSON.parse(await (await import("node:fs/promises")).readFile("showcase-photos/credits.json", "utf8")).filter((c) => c.slug !== "kia-sportage");
for (const [slug, title] of MODELS) {
  const page = await api({ action: "query", titles: title, redirects: "1", prop: "pageimages", piprop: "name", pilicense: "free" });
  let file = page.query?.pages?.[0]?.pageimage;
  if (!file) {
    const search = await api({ action: "query", generator: "search", gsrsearch: `${title} car`, gsrlimit: "3", prop: "pageimages", piprop: "name", pilicense: "free" });
    file = (search.query?.pages ?? []).sort((a, b) => a.index - b.index).find((p) => p.pageimage)?.pageimage;
  }
  if (!file) { console.log(`no image for ${title}`); continue; }
  const info = await api({ action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|size|extmetadata|mime", iiurlwidth: "1280", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl" });
  const ii = info.query?.pages?.[0]?.imageinfo?.[0];
  const license = strip(ii?.extmetadata?.LicenseShortName?.value);
  if (!ii || !FREE.test(license)) { console.log(`skip ${title}: licence "${license}"`); continue; }
  const img = await fetch(ii.thumburl ?? ii.url, { headers: UA });
  const ext = (ii.mime ?? "image/jpeg").includes("png") ? "png" : "jpg";
  await writeFile(`showcase-photos/${slug}.${ext}`, Buffer.from(await img.arrayBuffer()));
  credits.push({
    slug, model: title, file: `${slug}.${ext}`, source: ii.descriptionurl,
    author: strip(ii.extmetadata?.Artist?.value) || null, license,
    licenseUrl: ii.extmetadata?.LicenseUrl?.value ?? null,
  });
  console.log(`ok ${title}: ${license} by ${credits.at(-1).author}`);
}
await (await import("node:fs/promises")).rm("showcase-photos/kia-sportage.jpg", { force: true });
await writeFile("showcase-photos/credits.json", JSON.stringify(credits, null, 2) + "\n");
