import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES, THEME_IDS, resolveTheme, themeById } from "./themes";

const css = readFileSync("src/app/globals.css", "utf8");
const initScript = readFileSync("src/components/theme-provider.tsx", "utf8");

describe("theme registry", () => {
  it("gives every theme a token block in globals.css", () => {
    for (const id of THEME_IDS) {
      const selector = id === "light" ? ":root" : `[data-theme="${id}"]`;
      expect(css, `${id} has no ${selector} block`).toContain(selector);
    }
  });

  it("defines the same token names in every theme", () => {
    const namesIn = (selector: string) => {
      const open = css.indexOf("{", css.indexOf(selector));
      const body = css.slice(open + 1, css.indexOf("\n}", open));
      return [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]).sort();
    };
    const base = namesIn(":root");
    for (const theme of THEMES.filter((t) => t.id !== "light")) {
      // A theme may inherit a token, but must not invent one the base lacks.
      const extra = namesIn(`[data-theme="${theme.id}"]`).filter((n) => !base.includes(n));
      expect(extra, `${theme.id} defines tokens absent from :root`).toEqual([]);
    }
  });

  /**
   * The pre-paint script can't import this module, so it carries its own copy
   * of which themes are dark. If the two drift, a new dark theme renders with
   * light `color-scheme` and the wrong `dark:` variants.
   */
  it("keeps the pre-paint script's dark list in step with the registry", () => {
    const listed = initScript.match(/var d=\[([^\]]*)\]/);
    expect(listed, "couldn't find the dark-theme list in themeInitScript").not.toBeNull();

    const inScript = listed![1].split(",").map((s) => s.replace(/["']/g, "").trim()).sort();
    const inRegistry = THEMES.filter((t) => t.appearance === "dark").map((t) => t.id).sort();
    expect(inScript).toEqual(inRegistry);
  });

  it("resolves system to light or dark, and a named theme to itself", () => {
    expect(resolveTheme("system", false).id).toBe("light");
    expect(resolveTheme("system", true).id).toBe("dark");
    expect(resolveTheme("pastel", true).id).toBe("pastel");
  });

  it("falls back to light rather than crashing on an unknown stored value", () => {
    expect(resolveTheme("nonsense" as never, false).id).toBe("light");
    expect(themeById("nonsense")).toBeUndefined();
  });

  it("gives every theme a label, a description and three swatch colours", () => {
    for (const theme of THEMES) {
      expect(theme.label).not.toBe("");
      expect(theme.description).not.toBe("");
      expect(theme.swatch).toHaveLength(3);
      for (const colour of theme.swatch) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
