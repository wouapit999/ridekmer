"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface HeroPhoto {
  src: string;
  alt: string;
  credit?: { author: string; license: string; source: string };
}

const INTERVAL_MS = 6000;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Full-bleed background for the hero: the photos cross-fade every few seconds with a slow
 * "Ken Burns" zoom. Still (first photo only) for visitors who prefer reduced motion. The hero
 * content goes in `children`; the current photo's credit follows it in the normal flow, so it
 * never covers a button.
 */
export function HeroSlideshow({
  photos,
  creditLabel,
  children,
}: {
  photos: HeroPhoto[];
  creditLabel: string;
  children: ReactNode;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion || photos.length < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((i) => (i + 1) % photos.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion, photos.length]);

  const current = photos[index];
  return (
    <>
      <div className="absolute inset-0 -z-10 overflow-hidden bg-sand-900" aria-hidden="true">
        {photos.map((photo, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- static showcase photos, already sized
          <img
            key={photo.src}
            src={photo.src}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "low"}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-out",
              i === index ? "hero-kenburns opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>
      {children}
      {current?.credit ? (
        <p className="relative px-3 pb-2 text-right text-[11px] text-white">
          <a
            href={current.credit.source}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-sand-900/80 px-2 py-0.5 hover:underline"
          >
            {creditLabel} {current.credit.author} · {current.credit.license}
          </a>
        </p>
      ) : null}
    </>
  );
}
