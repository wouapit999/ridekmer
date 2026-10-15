"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Registers the service worker (public/sw.js), shows an "update available" prompt when a new
 * worker is waiting, and an offline banner when the browser loses connectivity (ADR-034).
 * No-op during development so hot reloading is not intercepted.
 */
export function ServiceWorkerManager() {
  const t = useTranslations("common.pwa");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const updateRequested = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    // Reload only after the person accepted an update: the first activation of the worker
    // (clients.claim) also fires controllerchange and must never interrupt a form or a login.
    let refreshing = false;
    const onControllerChange = () => {
      if (!updateRequested.current || refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      })
      .catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <>
      {offline ? (
        <p
          role="status"
          className="bg-sand-900 px-4 py-2 text-center text-sm font-medium text-white"
        >
          {t("offlineBanner")}
        </p>
      ) : null}
      {waiting && !dismissed ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white p-4 shadow-lg"
        >
          <p className="text-sm text-sand-800">{t("updateAvailable")}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              {t("dismiss")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                updateRequested.current = true;
                waiting.postMessage({ type: "SKIP_WAITING" });
              }}
            >
              {t("reload")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
