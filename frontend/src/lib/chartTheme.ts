export const chartColors = {
  background: "#0b1118",
  panel: "#0f1722",
  grid: "#1e2b38",
  text: "#d7dee7",
  muted: "#7b8794",
  accent: "#6bb7ff",
  model: "#d8a84c",
  residualPositive: "#d46a6a",
  residualNegative: "#80c990",
  selected: "#ffffff",
};

export const chartTextStyle = {
  color: chartColors.muted,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
  fontSize: 11,
};

export const chartGrid = {
  left: 58,
  right: 24,
  top: 36,
  bottom: 58,
};

export const chartAxisLine = {
  lineStyle: {
    color: chartColors.grid,
  },
};

export const chartSplitLine = {
  lineStyle: {
    color: chartColors.grid,
    opacity: 0.55,
  },
};
