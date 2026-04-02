export const THEME_STORAGE_KEY = "nb_theme";
export const THEME_CHANGE_EVENT = "nb-theme-change";

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

  const root = document.documentElement;
  if (root.dataset.theme === theme) return;

  root.dataset.theme = theme;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }),
    );
  }
}

export function persistTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}
