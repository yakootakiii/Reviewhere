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
