import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  persistTheme,
  getStoredTheme,
  getPreferredTheme,
  applyTheme,
  isTheme,
} from "@/lib/theme";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe("theme utils", () => {
  it("accepts only dark/light", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("other")).toBe(false);
  });

  it("returns stored theme when value is valid", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getStoredTheme()).toBe("light");
  });

  it("returns null when stored theme is invalid", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "other");
    expect(getStoredTheme()).toBeNull();
  });

  it("returns null when no stored theme", () => {
    expect(getStoredTheme()).toBeNull();
  });

  it("persists theme to localStorage", () => {
    persistTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("returns null when localStorage read throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("read blocked");
    });

    expect(getStoredTheme()).toBeNull();
  });

  it("does not throw when localStorage write throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("write blocked");
    });

    expect(() => persistTheme("light")).not.toThrow();
  });

  it("applies theme to document root", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("prefers light when matchMedia reports light preference", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      () => ({ matches: true }) as MediaQueryList,
    );

    expect(getPreferredTheme()).toBe("light");
  });

  it("prefers dark when matchMedia reports no light preference", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      () => ({ matches: false }) as MediaQueryList,
    );

    expect(getPreferredTheme()).toBe("dark");
  });
});
