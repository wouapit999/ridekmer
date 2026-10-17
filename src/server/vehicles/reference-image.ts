import { referenceQuery } from "@/features/vehicles/catalog";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Illustrative photo of a make and model, used only while the owner has not uploaded real
 * photos of the vehicle. Images come from Wikipedia/Wikimedia Commons and are restricted to
 * free licences (Creative Commons, public domain); the author, licence and source page are
 * kept so the page can credit them as the licences require. Nothing is copied to our storage.
 */
export interface ReferenceImage {
  url: string;
  width: number | null;
  height: number | null;
  sourcePageUrl: string;
  author: string | null;
  license: string;
  licenseUrl: string | null;
}

type FetchLike = (
  input: string,
  init?: RequestInit & { next?: { revalidate?: number } },
) => Promise<Response>;

const API = "https://en.wikipedia.org/w/api.php";
const THIRTY_DAYS = 60 * 60 * 24 * 30;
const FREE_LICENSE = /^(cc[\s-]|cc0|public domain|pd\b|pd-)/i;

function stripHtml(value: string | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 200) : null;
}

async function getJson(fetchImpl: FetchLike, params: Record<string, string>): Promise<unknown> {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`;
  const res = await fetchImpl(url, {
    headers: {
      "user-agent": `RideKmer/1.0 (+${getEnv().NEXT_PUBLIC_APP_URL})`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: THIRTY_DAYS },
  });
  if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
  return res.json();
}

interface PageImagesResponse {
  query?: { pages?: Array<{ title?: string; index?: number; pageimage?: string }> };
}
interface ImageInfoResponse {
  query?: {
    pages?: Array<{
      imageinfo?: Array<{
        thumburl?: string;
        thumbwidth?: number;
        thumbheight?: number;
        url?: string;
        width?: number;
        height?: number;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string } | undefined>;
      }>;
    }>;
  };
}

/**
 * Picks the lead free image of the best-ranked article, optionally only among articles whose
 * title contains `mustInclude` (the make), so a search like "Toyota Corolla 2008" cannot land
 * on an unrelated page about the year. Exported for unit tests.
 */
export function pickPageImage(body: unknown, mustInclude?: string): string | null {
  const pages = (body as PageImagesResponse).query?.pages ?? [];
  const sorted = [...pages].sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const want = mustInclude?.trim().toLowerCase();
  return (
    sorted.find((p) => p.pageimage && (!want || (p.title ?? "").toLowerCase().includes(want)))
      ?.pageimage ?? null
  );
}

/** Turns an imageinfo answer into a credited image, or null when the licence is not free. */
export function parseImageInfo(body: unknown): ReferenceImage | null {
  const info = (body as ImageInfoResponse).query?.pages?.[0]?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value) ?? "";
  if (!FREE_LICENSE.test(license)) return null;
  const url = info.thumburl ?? info.url;
  if (!url?.startsWith("https://upload.wikimedia.org/")) return null;
  return {
    url,
    width: info.thumbwidth ?? info.width ?? null,
    height: info.thumbheight ?? info.height ?? null,
    sourcePageUrl: info.descriptionurl ?? "https://commons.wikimedia.org/",
    author: stripHtml(meta.Artist?.value),
    license,
    licenseUrl: meta.LicenseUrl?.value?.startsWith("http") ? meta.LicenseUrl.value : null,
  };
}

export async function findReferenceImage(
  make: string,
  model: string,
  fetchImpl: FetchLike = fetch,
  year?: number | null,
): Promise<ReferenceImage | null> {
  const query = referenceQuery(make, model).slice(0, 120);
  if (query.trim().length < 3) return null;
  const searchFor = async (text: string) =>
    pickPageImage(
      await getJson(fetchImpl, {
        action: "query",
        generator: "search",
        gsrsearch: text,
        gsrlimit: "5",
        gsrnamespace: "0",
        prop: "pageimages",
        piprop: "name",
        pilicense: "free",
      }),
      make,
    );
  try {
    // With a year, prefer the article of that generation ("Toyota Corolla (E140)" for 2008),
    // then fall back to the model's main article.
    const validYear = year && year >= 1950 && year <= new Date().getFullYear() + 1 ? year : null;
    const file =
      (validYear ? await searchFor(`${query} ${validYear}`) : null) ??
      (await searchFor(`${query} car`));
    if (!file) return null;
    const info = await getJson(fetchImpl, {
      action: "query",
      titles: `File:${file}`,
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "960",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
    });
    return parseImageInfo(info);
  } catch (error) {
    logger.warn("reference image lookup failed", {
      make,
      model,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Looks up several vehicles at once; duplicates (same make, model and year) share one lookup. */
export async function findReferenceImages(
  vehicles: Array<{ id: string; make: string; model: string; manufacturingYear?: number | null }>,
): Promise<Map<string, ReferenceImage>> {
  const byKey = new Map<string, Promise<ReferenceImage | null>>();
  const result = new Map<string, ReferenceImage>();
  await Promise.all(
    vehicles.map(async (v) => {
      const key = `${v.make}|${v.model}|${v.manufacturingYear ?? ""}`.toLowerCase();
      if (!byKey.has(key))
        byKey.set(key, findReferenceImage(v.make, v.model, fetch, v.manufacturingYear));
      const image = await byKey.get(key);
      if (image) result.set(v.id, image);
    }),
  );
  return result;
}
