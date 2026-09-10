"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { usePersistedValue, useSystemTheme } from "@/lib/persisted-state";
import { resolveTheme, type Theme, type ThemePreference } from "@/lib/themes";

export const THEME_STORAGE_KEY = "reviewhere.theme";

/**
 * Runs synchronously in <head> before first paint so the resolved theme is on
 * <html> before anything renders — no flash. Kept in sync with the effect
 * below; both stamp `data-theme` (which token block applies) and
 * `data-appearance` (whether that theme is light or dark, which drives
 * color-scheme and the `dark:` variant).
 *
 * The dark-appearance list is inlined because this runs before any module
 * loads. If a dark theme is added to `themes.ts`, add its id here too.
 */
export const themeInitScript = `(function(){try{var d=["dark","midnight","slate"];var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var prefersDark=window.matchMedia("(prefers-color-scheme: dark)").matches;var t=p==="system"?(prefersDark?"dark":"light"):p;var a=d.indexOf(t)>-1?"dark":"light";var e=document.documentElement;e.dataset.theme=t;e.dataset.appearance=a;e.style.colorScheme=a;}catch(err){var f=document.documentElement;f.dataset.theme="light";f.dataset.appearance="light";}})();`;

type ThemeContextValue = {
  /** What the user chose, including "system". */
  preference: ThemePreference;
  /** The theme actually in effect, once "system" is resolved. */
  resolved: Theme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = usePersistedValue<ThemePreference>(
    THEME_STORAGE_KEY,
    "system",
  );
  const systemTheme = useSystemTheme();
  const resolved = resolveTheme(preference, systemTheme === "dark");

  // Sync React's resolved value out to the DOM the init script already stamped.
  useEffect(() => {
    const element = document.documentElement;
    element.dataset.theme = resolved.id;
    element.dataset.appearance = resolved.appearance;
    element.style.colorScheme = resolved.appearance;
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
