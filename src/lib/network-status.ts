"use client";

import { useSyncExternalStore } from "react";

/**
 * Online/offline as an external store, for the same reason localStorage is one
 * in `persisted-state.ts`: it is state React doesn't own, and reading it through
 * an effect would trip `react-hooks/set-state-in-effect`.
 */
function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // Assume online on the server: a false offline warning on first paint would
    // be worse than a moment of silence.
    () => true,
  );
}
