"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyTheme,
  getPreferredTheme,
  getStoredTheme,
  isTheme,
  persistTheme,
  type ThemeMode,
} from "@/lib/theme";

export function useTheme() {
  const initial = useMemo(() => {
    let domTheme: ThemeMode | null = null;
    if (typeof document !== "undefined") {
      const rawTheme = document.documentElement.dataset.theme;
      domTheme = rawTheme && isTheme(rawTheme) ? rawTheme : null;
    }

    const storedTheme = getStoredTheme();
    return {
      theme: domTheme ?? storedTheme ?? getPreferredTheme(),
      hasExplicitPreference: storedTheme !== null,
    };
  }, []);

  const getDomTheme = useCallback((): ThemeMode | null => {
    if (typeof document === "undefined") return null;
    const domTheme = document.documentElement.dataset.theme;
    return domTheme && isTheme(domTheme) ? domTheme : null;
  }, []);

  const [theme, setTheme] = useState<ThemeMode>(initial.theme);

  const hasExplicitPreferenceRef = useRef(initial.hasExplicitPreference);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (hasExplicitPreferenceRef.current || typeof window === "undefined")
      return;

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      if (hasExplicitPreferenceRef.current) return;
      setTheme(e.matches ? "light" : "dark");
    };

    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const setAndPersist = useCallback((next: ThemeMode) => {
    hasExplicitPreferenceRef.current = true;
    persistTheme(next);
    setTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    const current = getDomTheme() ?? theme;
    setAndPersist(current === "dark" ? "light" : "dark");
  }, [getDomTheme, theme, setAndPersist]);

  return { theme, setTheme: setAndPersist, toggleTheme };
}
