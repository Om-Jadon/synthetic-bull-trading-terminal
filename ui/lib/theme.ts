export const THEME_STORAGE_KEY = "nb_theme";

export type ThemeMode = "dark" | "light";

export function isTheme(v: string): v is ThemeMode {
  return v === "dark" || v === "light";
}

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw && isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  return mq?.matches ? "light" : "dark";
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function persistTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}
