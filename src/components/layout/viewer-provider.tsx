"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Viewer } from "./user-menu";

interface ViewerState {
  viewer: Viewer | null;
  loaded: boolean;
  refresh: () => void;
}

const ViewerContext = createContext<ViewerState>({
  viewer: null,
  loaded: false,
  refresh: () => undefined,
});

/**
 * Fetches the signed-in state once per navigation from `/api/account/viewer` so that the
 * public pages can be static while the header still reflects the session (ADR-033).
 */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/viewer", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { viewer: null }))
      .then((data: { viewer: Viewer | null }) => {
        if (cancelled) return;
        setViewer(data.viewer);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, tick]);

  // Refresh the unread count when the visitor comes back to the tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return (
    <ViewerContext.Provider value={{ viewer, loaded, refresh: () => setTick((n) => n + 1) }}>
      {children}
    </ViewerContext.Provider>
  );
}

export function useViewer(): ViewerState {
  return useContext(ViewerContext);
}
