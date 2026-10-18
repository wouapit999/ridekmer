"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/cn";

export interface GalleryPhoto {
  url: string;
  /** Front, back, side or interior; null for an extra photo. */
  view: "front" | "back" | "side" | "interior" | null;
}

const AUTO_ROTATE_MS = 3500;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** Horizontal drag distance that turns the car to the next photo. */
const DRAG_STEP_PX = 60;

/**
 * Turning photo viewer for a listing: it rotates through the photos on its own, and the
 * customer can drag or swipe across it to turn the car, or use the arrows and thumbnails.
 * Rotation pauses while the pointer is over it, and never starts with reduced motion.
 */
export function VehicleGallery({ photos, alt }: { photos: GalleryPhoto[]; alt: string }) {
  const t = useTranslations("cars.detail.gallery");
  const tv = useTranslations("owner.wizard.photos.views");
  const count = photos.length;
  const [index, setIndex] = useState(0);
  // Rendered paused on the server; starts turning once the browser allows motion.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
  const [stopped, setStopped] = useState(false);
  const playing = !stopped && !reducedMotion;
  const [hovered, setHovered] = useState(false);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (!playing || hovered || count < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), AUTO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [playing, hovered, count]);

  if (count === 0) return null;
  const current = photos[index];

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // The arrows sit on the photo: capturing their press would swallow the click.
    if (count < 2 || (e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, start: index, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const steps = Math.trunc((e.clientX - d.x) / DRAG_STEP_PX);
    if (steps !== 0) d.moved = true;
    // Dragging left turns the car forward, like spinning it on a turntable.
    go(d.start - steps);
  }
  function onPointerUp() {
    if (drag.current?.moved) setStopped(true);
    drag.current = null;
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("label", { name: alt })}
      className="space-y-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div
        className={cn(
          "relative aspect-[4/3] touch-pan-y overflow-hidden rounded-lg bg-sand-100 select-none",
          count > 1 && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(index + 1);
          if (e.key === "ArrowLeft") go(index - 1);
        }}
        tabIndex={count > 1 ? 0 : undefined}
        role="group"
        aria-label={t("position", { index: index + 1, count })}
      >
        {photos.map((photo, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
          <img
            key={photo.url}
            src={photo.url}
            alt={photo.view ? `${alt} — ${tv(photo.view)}` : `${alt} ${i + 1}`}
            draggable={false}
            aria-hidden={i !== index}
            loading={i === 0 ? "eager" : "lazy"}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
        {current.view ? (
          <span className="absolute top-3 left-3 rounded-full bg-sand-900/70 px-3 py-1 text-xs font-semibold text-white">
            {tv(current.view)}
          </span>
        ) : null}
        {count > 1 ? (
          <>
            <span className="absolute top-3 right-3 rounded-full bg-sand-900/70 px-3 py-1 text-xs text-white">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label={t("previous")}
              className="absolute top-1/2 left-2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-sand-900 shadow hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label={t("next")}
              className="absolute top-1/2 right-2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-sand-900 shadow hover:bg-white"
            >
              ›
            </button>
            <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-sand-900/70 px-3 py-1 text-xs text-white">
              ⟲ {t("dragHint")}
            </span>
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <div className="flex items-center gap-2">
          <ul className="flex flex-1 gap-2 overflow-x-auto pb-1">
            {photos.map((photo, i) => (
              <li key={photo.url} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    go(i);
                    setStopped(true);
                  }}
                  aria-current={i === index}
                  aria-label={photo.view ? tv(photo.view) : t("photo", { index: i + 1 })}
                  className={cn(
                    "block w-20 overflow-hidden rounded-md border-2 sm:w-24",
                    i === index ? "border-brand-600" : "border-transparent opacity-80",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL */}
                  <img src={photo.url} alt="" className="aspect-[4/3] w-full object-cover" />
                  {photo.view ? (
                    <span className="block bg-white py-0.5 text-center text-[11px] text-sand-700">
                      {tv(photo.view)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setStopped(playing)}
            className="shrink-0 rounded-md border border-sand-300 bg-white px-3 py-2 text-xs font-semibold text-sand-800 hover:bg-sand-100"
          >
            {playing ? t("pause") : t("play")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
