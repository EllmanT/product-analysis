"use client";

import { useEffect } from "react";

/**
 * Registers the till service worker. Skipped in development (hashed dev chunks change constantly),
 * unless the page is opened with ?sw=1 to test it.
 */
export default function PosServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const enabled = process.env.NODE_ENV === "production" || new URLSearchParams(location.search).has("sw");
    if (!enabled) return;
    navigator.serviceWorker.register("/pos-sw.js", { scope: "/" }).catch(() => {
      /* the till still works online without it */
    });
  }, []);
  return null;
}
