export type ChartPalette = {
  bg: string;
  textMuted: string;
  grid: string;
  crosshair: string;
  bull: string;
  bear: string;
  vwap: string;
  watermark: string;
};

export type BotPalette = {
  marketMaker: string;
  alphaBot: string;
};

const DEFAULT_PALETTE: ChartPalette = {
  bg: "#060403",
  textMuted: "#7f7672",
  grid: "#1a1513",
  crosshair: "#292220",
  bull: "#11b34a",
  bear: "#df202e",
  vwap: "#8791a3",
  watermark: "rgba(200, 151, 42, 0.06)",
};

const DEFAULT_BOT_PALETTE: BotPalette = {
  marketMaker: "#6366f1",
  alphaBot: "#f59e0b",
};

function readColorVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value.length > 0 ? value : fallback;
}

function readHexColorVar(name: string, fallback: string): string {
  const value = readColorVar(name, fallback);
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : fallback;
}

export function readChartPalette(): ChartPalette {
  return {
    bg: readHexColorVar("--color-chart-bg-hex", DEFAULT_PALETTE.bg),
    textMuted: readHexColorVar(
      "--color-text-muted-hex",
      DEFAULT_PALETTE.textMuted,
    ),
    grid: readHexColorVar("--color-chart-grid-hex", DEFAULT_PALETTE.grid),
    crosshair: readHexColorVar(
      "--color-chart-crosshair-hex",
      DEFAULT_PALETTE.crosshair,
    ),
    bull: readHexColorVar("--color-bull-hex", DEFAULT_PALETTE.bull),
    bear: readHexColorVar("--color-bear-hex", DEFAULT_PALETTE.bear),
    vwap: readHexColorVar("--color-chart-vwap-hex", DEFAULT_PALETTE.vwap),
    watermark: readColorVar(
      "--color-brand-watermark",
      DEFAULT_PALETTE.watermark,
    ),
  };
}

export function readBotPalette(): BotPalette {
  return {
    marketMaker: readHexColorVar(
      "--color-bot-mm-hex",
      DEFAULT_BOT_PALETTE.marketMaker,
    ),
    alphaBot: readHexColorVar(
      "--color-bot-alpha-hex",
      DEFAULT_BOT_PALETTE.alphaBot,
    ),
  };
}
