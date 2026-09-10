/**
 * The theme registry. Adding a theme means a token block in globals.css and an
 * entry here — nothing else in the app knows a theme exists, because every
 * component reads semantic tokens.
 *
 * `appearance` is what `color-scheme` and the `dark:` variant follow: a theme
 * is light or dark regardless of what it's called. `swatch` is only for the
 * picker's preview dots.
 */
export const THEME_IDS = ["light", "dark", "paper", "pastel", "midnight", "slate"] as const;

export type ThemeId = (typeof THEME_IDS)[number];
/** What the user picked, which may be "follow the system". */
export type ThemePreference = ThemeId | "system";

export interface Theme {
  id: ThemeId;
  label: string;
  description: string;
  appearance: "light" | "dark";
  /** page, surface, accent — drawn as three dots in the picker. */
  swatch: [string, string, string];
}

export const THEMES: Theme[] = [
  {
    id: "light",
    label: "Light",
    description: "White page, one blue accent",
    appearance: "light",
    swatch: ["#ffffff", "#f5f5f7", "#0066cc"],
  },
  {
    id: "dark",
    label: "Dark",
    description: "Near-black, neutral",
    appearance: "dark",
    swatch: ["#0b0b0c", "#1a1a1c", "#4da3ff"],
  },
  {
    id: "paper",
    label: "Paper",
    description: "Warm off-white, easy on the eyes",
    appearance: "light",
    swatch: ["#faf6ef", "#f2ece1", "#9a5324"],
  },
  {
    id: "pastel",
    label: "Pastel",
    description: "Soft and cool, with a violet accent",
    appearance: "light",
    swatch: ["#f8f7fc", "#eeecf8", "#5a4ac4"],
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep blue, for late sessions",
    appearance: "dark",
    swatch: ["#0b1020", "#161d33", "#7fb0ff"],
  },
  {
    id: "slate",
    label: "Slate",
    description: "Cool grey with a teal accent",
    appearance: "dark",
    swatch: ["#14171a", "#212529", "#6fd3c7"],
  },
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((theme) => theme.id === id);
}

/** Resolves a preference to a concrete theme, given what the OS reports. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === "system") {
    return themeById(systemPrefersDark ? "dark" : "light")!;
  }
  return themeById(preference) ?? themeById("light")!;
}
