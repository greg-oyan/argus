interface EventData {
  pointId?: unknown;
}

interface ChartEvent {
  data?: EventData;
}

interface ZrClickEvent {
  target?: unknown;
}

interface ChartLike {
  getZr: () => {
    on: (eventName: "click", handler: (event: ZrClickEvent) => void) => void;
  };
}

export function pointIdFromChartEvent(params: unknown): string | null {
  const data = (params as ChartEvent | undefined)?.data;
  return typeof data?.pointId === "string" ? data.pointId : null;
}

export function installClearSelectionOnBackgroundClick(
  chart: ChartLike,
  clearSelectedPointId: () => void,
) {
  chart.getZr().on("click", (event) => {
    if (!event.target) {
      clearSelectedPointId();
    }
  });
}
