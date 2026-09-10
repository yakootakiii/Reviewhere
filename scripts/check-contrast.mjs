/**
 * Every theme has to meet WCAG AA (§6) on its own surfaces, not just the two
 * we happened to design first. This parses the token blocks straight out of
 * globals.css so a new theme cannot be added without being checked.
 *
 *   npm run check:contrast
 */
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/** Pulls `--token: value;` pairs out of one selector block. */
function tokens(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`No block for ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const body = css.slice(open + 1, close);
  const found = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    found[name] = value.trim();
  }
  return found;
}

const base = tokens(":root");
const themes = {
  light: base,
  dark: { ...base, ...tokens('[data-theme="dark"]') },
  paper: { ...base, ...tokens('[data-theme="paper"]') },
  pastel: { ...base, ...tokens('[data-theme="pastel"]') },
  midnight: { ...base, ...tokens('[data-theme="midnight"]') },
  slate: { ...base, ...tokens('[data-theme="slate"]') },
};

const hex = (value) => {
  const m = value.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`Not a plain hex colour: ${value}`);
  return m[1];
};
const luminance = (value) => {
  const c = hex(value);
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Text on the surfaces it actually sits on, plus the accent's own foreground.
const checks = (t) => [
  ["body on page", t["--color-text-primary"], t["--color-bg"]],
  ["body on well", t["--color-text-primary"], t["--color-surface-secondary"]],
  ["secondary on page", t["--color-text-secondary"], t["--color-bg"]],
  ["secondary on well", t["--color-text-secondary"], t["--color-surface-secondary"]],
  ["tertiary on page", t["--color-text-tertiary"], t["--color-bg"]],
  ["tertiary on well", t["--color-text-tertiary"], t["--color-surface-secondary"]],
  ["accent link on page", t["--color-accent"], t["--color-bg"]],
  ["accent button label", t["--color-accent-foreground"], t["--color-accent"]],
  ["success on page", t["--color-success"], t["--color-bg"]],
  ["warning on page", t["--color-warning"], t["--color-bg"]],
  ["error on page", t["--color-error"], t["--color-bg"]],
];

const AA = 4.5;
let failures = 0;

for (const [name, theme] of Object.entries(themes)) {
  const rows = checks(theme).map(([label, fg, bg]) => ({ label, value: ratio(fg, bg) }));
  const worst = Math.min(...rows.map((r) => r.value));
  const bad = rows.filter((r) => r.value < AA);
  failures += bad.length;
  console.log(
    `${bad.length === 0 ? "PASS" : "FAIL"}  ${name.padEnd(9)} worst ${worst.toFixed(2)}:1`,
  );
  for (const row of bad) console.log(`        ${row.value.toFixed(2)}  ${row.label}`);
}

console.log(
  failures === 0
    ? `\nAll ${Object.keys(themes).length} themes meet AA on every pair checked.`
    : `\n${failures} pair(s) below ${AA}:1`,
);
process.exit(failures === 0 ? 0 : 1);
