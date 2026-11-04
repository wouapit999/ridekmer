"use client";

import { Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Link } from "@/i18n/navigation";

import { RIBBON_KEY_PREFIX, festiveBootScript, festiveYear } from "./festive";

// Decorations are always in the HTML and hidden by CSS (globals.css, ".festive-only") until the
// boot script marks <html data-festive>: no layout shift, and correct on statically built pages.

/** Put once near the top of <body>, before any decoration. */
export function FestiveBootScript() {
  return <script dangerouslySetInnerHTML={{ __html: festiveBootScript() }} />;
}

const noop = () => () => undefined;
const yearNow = () => festiveYear(new Date());

/** Slim holiday ribbon above the header, closable for the rest of the season. */
export function FestiveRibbon() {
  const t = useTranslations("festive");
  // The server's year can be weeks old on a static page; the client value replaces it.
  const year = useSyncExternalStore(noop, yearNow, yearNow);
  return (
    <div className="festive-only festive-ribbon-box festive-ribbon relative overflow-hidden text-sand-900">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-10 py-2 text-center text-sm font-medium">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          {t("ribbon", { christmas: year, newYear: year + 1 })}{" "}
          <Link href="/cars" className="font-semibold underline underline-offset-2">
            {t("ribbonCta")}
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          document.documentElement.setAttribute("data-festive-ribbon-off", "");
          try {
            window.localStorage.setItem(`${RIBBON_KEY_PREFIX}${yearNow()}`, "1");
          } catch {
            // Private mode: hidden for this visit only.
          }
        }}
        aria-label={t("close")}
        className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full hover:bg-white/40"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// Fixed positions (not random) so every render, server or client, draws the same scene.
const SPARKLES = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: (i * 0.73) % 9,
  duration: 7 + ((i * 1.9) % 6),
  size: 4 + ((i * 3) % 6),
}));
const BULBS = 18;

/** Gold string lights and slowly falling sparkles over a dark hero (decorative only). */
export function FestiveSparkles() {
  return (
    <div
      aria-hidden="true"
      className="festive-only pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
    >
      <div className="festive-lights absolute inset-x-0 top-0 flex justify-around">
        {Array.from({ length: BULBS }, (_, i) => (
          <span key={i} className="festive-bulb" style={{ animationDelay: `${(i % 6) * 0.35}s` }} />
        ))}
      </div>
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="festive-sparkle"
          style={{
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Hero eyebrow: the festive line in season, the regular one otherwise (switched by CSS). */
export function FestiveEyebrow({ fallback }: { fallback: string }) {
  const t = useTranslations("festive");
  return (
    <>
      <span className="festive-off">{fallback}</span>
      <span className="festive-only items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-300" aria-hidden="true" />
        {t("eyebrow")}
      </span>
    </>
  );
}
