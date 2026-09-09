"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { usePersistedValue, useSystemTheme } from "@/lib/persisted-state";
import type { ThemePreference } from "@/lib/types";

export const THEME_STORAGE_KEY = "reviewhere.theme";

/**
 * Runs synchronously in <head> before first paint so the resolved theme is on
 * <html> before anything renders — no flash. Kept in sync with the effect below.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var r=p==="system"?(d?"dark":"light"):p;document.documentElement.dataset.theme=r;document.documentElement.style.colorScheme=r;}catch(e){document.documentElement.dataset.theme="light";}})();`;

type ThemeContextValue = {
  /** What the user chose, including "system". */
  preference: ThemePreference;
  /** What "system" actually resolved to right now. */
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = usePersistedValue<ThemePreference>(
    THEME_STORAGE_KEY,
    "system",
  );
  const systemTheme = useSystemTheme();
  const resolved = preference === "system" ? systemTheme : preference;

  // Sync React's resolved value out to the DOM the init script already stamped.
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
