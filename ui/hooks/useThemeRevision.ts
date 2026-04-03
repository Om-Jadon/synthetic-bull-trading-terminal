"use client";

import { useEffect, useState } from "react";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

export function useThemeRevision(): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onThemeChange = () => {
      setRevision((v) => v + 1);
    };

    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  return revision;
}
