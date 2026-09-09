"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage is external state, so it's read through useSyncExternalStore
 * rather than an effect: no cascading render, and the server snapshot keeps
 * hydration honest. Same-tab writes broadcast a custom event because the
 * native `storage` event only fires in *other* tabs.
 */
const CHANGE_EVENT = "reviewhere:storage";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function usePersistedValue<T extends string>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return (localStorage.getItem(key) as T | null) ?? fallback;
      } catch {
        // Private browsing — fall back for this session.
        return fallback;
      }
    },
    () => fallback,
  );

  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        /* Ignored: the in-memory value below still updates the UI. */
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  return [value, setValue];
}

/**
 * The JSON sibling of `usePersistedValue`, for the in-progress quiz session
 * (§2.4 pause/resume).
 *
 * The cache is load-bearing, not an optimisation: `useSyncExternalStore` compares
 * snapshots by identity, so parsing afresh on every call would hand React a new
 * object each render and spin forever. Re-parsing only when the raw string
 * changes keeps the snapshot stable.
 */
const parseCache = new Map<string, { raw: string; value: unknown }>();

function readJson<T>(key: string, fallback: T): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Private browsing — behave as though nothing was stored.
    return fallback;
  }
  if (raw === null) return fallback;

  const cached = parseCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  try {
    const value = JSON.parse(raw) as T;
    parseCache.set(key, { raw, value });
    return value;
  } catch {
    // Corrupt or hand-edited entry: ignore it rather than crashing the page.
    return fallback;
  }
}

/**
 * Reads the stored value outside React. The setter below uses it so a functional
 * update always composes onto the latest written value rather than whatever the
 * caller's render closure captured — two updates in one event handler would
 * otherwise clobber each other.
 */
export function readPersistedJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return readJson(key, fallback);
}

export function usePersistedJson<T>(
  key: string,
  fallback: T,
): [T, (value: T | null | ((previous: T) => T)) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readJson(key, fallback),
    () => fallback,
  );

  const setValue = useCallback(
    (update: T | null | ((previous: T) => T)) => {
      const next =
        typeof update === "function"
          ? (update as (previous: T) => T)(readJson(key, fallback))
          : update;
      try {
        if (next === null) {
          localStorage.removeItem(key);
          parseCache.delete(key);
        } else {
          const raw = JSON.stringify(next);
          localStorage.setItem(key, raw);
          parseCache.set(key, { raw, value: next });
        }
      } catch {
        /* Ignored: the store simply stays empty for this session. */
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key, fallback],
  );

  return [value, setValue];
}

/** Tracks the OS colour scheme so a "system" theme preference stays live. */
export function useSystemTheme(): "light" | "dark" {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    () => "light",
  );
}
