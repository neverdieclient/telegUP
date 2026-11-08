/**
 * Colour themes.
 *
 * The UI is written against two accent utilities, `neon` (primary) and
 * `violet` (secondary). Tailwind v4 resolves those from CSS variables, so a
 * theme is just a set of variable overrides on <html>. Nothing else has to
 * know about theming.
 */

export type ThemeId = "lime" | "violet" | "ocean" | "sunset" | "rose" | "ice";

export type Theme = {
  id: ThemeId;
  name: string;
  /** primary accent */
  primary: string;
  primaryDim: string;
  /** secondary accent */
  secondary: string;
  secondaryDim: string;
  /** page background tint */
  ink: string;
};

export const THEMES: Theme[] = [
  {
    id: "lime",
    name: "Лайм",
    primary: "#a3ff12",
    primaryDim: "#7ac200",
    secondary: "#8b5cf6",
    secondaryDim: "#6d3fd1",
    ink: "#0a0a0a",
  },
  {
    id: "violet",
    name: "Фиолет",
    primary: "#a78bfa",
    primaryDim: "#7c5cf0",
    secondary: "#f472b6",
    secondaryDim: "#db2777",
    ink: "#0b0910",
  },
  {
    id: "ocean",
    name: "Океан",
    primary: "#38d6ff",
    primaryDim: "#0ea5c9",
    secondary: "#5b8cff",
    secondaryDim: "#3b6fe0",
    ink: "#070b12",
  },
  {
    id: "sunset",
    name: "Закат",
    primary: "#ffa53d",
    primaryDim: "#e07a12",
    secondary: "#ff4d8d",
    secondaryDim: "#d61f63",
    ink: "#0f0906",
  },
  {
    id: "rose",
    name: "Роза",
    primary: "#ff77b0",
    primaryDim: "#e04b8c",
    secondary: "#9d7bff",
    secondaryDim: "#7550e8",
    ink: "#0d0709",
  },
  {
    id: "ice",
    name: "Лёд",
    primary: "#cfe9ff",
    primaryDim: "#8fc3e8",
    secondary: "#7aa7ff",
    secondaryDim: "#4f7fe6",
    ink: "#070a0f",
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, Theme>;

export const DEFAULT_THEME: ThemeId = "lime";

export function applyTheme(id: ThemeId) {
  const t = THEME_BY_ID[id] ?? THEMES[0];
  const root = document.documentElement;
  root.style.setProperty("--color-neon", t.primary);
  root.style.setProperty("--color-neon-dim", t.primaryDim);
  root.style.setProperty("--color-violet", t.secondary);
  root.style.setProperty("--color-violet-dim", t.secondaryDim);
  root.style.setProperty("--color-ink", t.ink);
  root.dataset.theme = t.id;
  root.style.colorScheme = "dark";
}