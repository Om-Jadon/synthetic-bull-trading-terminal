import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { useTheme } from "@/hooks/useTheme";

describe("useTheme", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("initializes with dark default", async () => {
    const { result } = renderHook(() => useTheme());

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    expect(result.current.theme).toBe("dark");
  });

  it("toggle swaps theme and persists", async () => {
    const { result } = renderHook(() => useTheme());

    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
    });

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("initializes from stored light theme", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const { result } = renderHook(() => useTheme());

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    expect(result.current.theme).toBe("light");
  });

  it("falls back to preferred light theme when nothing is stored", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-color-scheme: light)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    );

    const { result } = renderHook(() => useTheme());

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    expect(result.current.theme).toBe("light");
  });

  it("toggles immediately from DOM light theme to dark", () => {
    document.documentElement.dataset.theme = "light";

    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
