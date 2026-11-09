"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Household } from "@/lib/engine";
import PassportView, { PassportNotFound } from "@/components/passport-view";

const STORAGE_KEY = "threshold-households-v2";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Households added in intake live only in this browser, so their passport is read here. */
export default function LocalPassport({ token }: { token: string }) {
  // undefined means the server render, before the browser's records can be read.
  const stored = useSyncExternalStore(subscribe, readStored, () => undefined);
  const household = useMemo(() => {
    if (!stored) return null;
    try {
      const list = JSON.parse(stored) as Household[];
      return list.find((h) => h.id.toLowerCase() === token.toLowerCase()) ?? null;
    } catch {
      return null;
    }
  }, [stored, token]);

  if (stored === undefined) return <main className="passport" />;
  return household ? <PassportView household={household} /> : <PassportNotFound />;
}
