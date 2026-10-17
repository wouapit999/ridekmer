"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export interface PreviewImage {
  url: string;
  sourcePageUrl: string;
  author: string | null;
  license: string;
}

export interface PhotoLookup {
  /** "idle" until make and model are known. */
  status: "idle" | "loading" | "found" | "none";
  image: PreviewImage | null;
  label: string;
}

function validYear(year: string): string | null {
  const n = Number(year);
  return /^\d{4}$/.test(year) && n >= 1950 && n <= new Date().getFullYear() + 1 ? year : null;
}

/** Looks up the free-licence photo of a make, model and (optional) year as the owner types. */
export function useReferencePhoto(make: string, model: string, year: string): PhotoLookup {
  const y = validYear(year.trim());
  const key =
    make.trim().length >= 2 && model.trim().length >= 1 ? `${make}|${model}|${y ?? ""}` : null;
  const [result, setResult] = useState<{
    key: string;
    image: PreviewImage | null;
    done: boolean;
  } | null>(null);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResult({ key, image: null, done: false });
      try {
        const params = new URLSearchParams({ make: make.trim(), model: model.trim() });
        if (y) params.set("year", y);
        const res = await fetch(`/api/vehicles/reference-image?${params}`, {
          signal: controller.signal,
        });
        const body = res.ok ? ((await res.json()) as { image: PreviewImage | null }) : null;
        setResult({ key, image: body?.image ?? null, done: true });
      } catch {
        if (!controller.signal.aborted) setResult({ key, image: null, done: true });
      }
    }, 450);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, make, model, y]);
  const label = [make.trim(), model.trim(), y].filter(Boolean).join(" ");
  const current = result && result.key === key ? result : null;
  if (!key) return { status: "idle", image: null, label };
  if (!current || !current.done) return { status: "loading", image: null, label };
  return { status: current.image ? "found" : "none", image: current.image, label };
}

/**
 * The photo customers will see until the owner uploads real ones: beside the form on wide
 * screens ("side"), under the model field on phones ("inline").
 */
export function ModelPhotoPreview({
  lookup,
  variant,
}: {
  lookup: PhotoLookup;
  variant: "side" | "inline";
}) {
  const t = useTranslations("cars.photo");
  const side = variant === "side";
  if (lookup.status === "idle")
    return side ? (
      <div className="rounded-lg border border-dashed border-sand-300 bg-white p-5 text-sm text-sand-600">
        {t("sideHint")}
      </div>
    ) : null;
  return (
    <figure
      className={
        side
          ? "overflow-hidden rounded-lg border border-sand-200 bg-white shadow-card"
          : "flex items-start gap-3 rounded-md border border-sand-200 bg-sand-50 p-3"
      }
      aria-live="polite"
    >
      <div
        className={
          side
            ? "relative aspect-[4/3] bg-sand-100"
            : "relative h-20 w-32 shrink-0 overflow-hidden rounded bg-sand-100"
        }
      >
        {lookup.status === "found" && lookup.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote Wikimedia thumbnail */}
            <img
              src={lookup.image.url}
              alt={t("illustrativeAlt", { name: lookup.label })}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            {side ? (
              <span className="absolute top-2 left-2 rounded bg-sand-900/75 px-2 py-0.5 text-xs font-medium text-white">
                {t("illustrative")}
              </span>
            ) : null}
          </>
        ) : (
          <span
            className={`flex h-full w-full items-center justify-center text-xs text-sand-500 ${lookup.status === "loading" ? "animate-pulse" : ""}`}
          >
            {lookup.status === "loading" ? t("previewLoading") : t("none")}
          </span>
        )}
      </div>
      <figcaption
        className={side ? "space-y-1 p-4 text-xs text-sand-700" : "text-xs text-sand-700"}
      >
        <span
          className={
            side ? "block text-base font-semibold text-sand-900" : "block font-medium text-sand-900"
          }
        >
          {lookup.label}
        </span>
        {lookup.status === "found" && lookup.image ? (
          <>
            <span className="block">{t("previewBody")}</span>
            <a
              href={lookup.image.sourcePageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {lookup.image.author
                ? t("credit", { author: lookup.image.author, license: lookup.image.license })
                : t("creditNoAuthor", { license: lookup.image.license })}
            </a>
          </>
        ) : lookup.status === "none" ? (
          <span className="block">{t("previewNone")}</span>
        ) : null}
      </figcaption>
    </figure>
  );
}
