"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Lifts its content into place the first time it scrolls into view. Content stays
 * visible without JavaScript, and appears at once for visitors who prefer reduced motion.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Milliseconds, to stagger items in a row. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    // Already on screen at load: show without animating, so nothing flickers.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) return;
    setState("hidden");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={state === "shown" ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        // Slide only, no fade: text is never half-transparent, so contrast holds throughout.
        state === "hidden" && "translate-y-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
