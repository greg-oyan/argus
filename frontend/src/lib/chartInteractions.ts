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

interface DataZoomSource {
  start?: unknown;
  end?: unknown;
  startValue?: unknown;
  endValue?: unknown;
}

interface DataZoomEvent extends DataZoomSource {
  batch?: DataZoomSource[];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

export function selectedTimeRangeFromDataZoomEvent(
  params: unknown,
  minMjd: number,
  maxMjd: number,
): { startMjd: number | null; endMjd: number | null } | null {
  if (!Number.isFinite(minMjd) || !Number.isFinite(maxMjd) || maxMjd <= minMjd) {
    return null;
  }

  const event = params as DataZoomEvent;
  const source = event.batch?.[0] ?? event;
  const startValue = finiteNumber(source.startValue);
  const endValue = finiteNumber(source.endValue);

  if (startValue !== null && endValue !== null) {
    return { startMjd: Math.min(startValue, endValue), endMjd: Math.max(startValue, endValue) };
  }

  const start = finiteNumber(source.start);
  const end = finiteNumber(source.end);
  if (start === null || end === null) {
    return null;
  }
  if (start <= 0 && end >= 100) {
    return null;
  }

  const span = maxMjd - minMjd;
  const startMjd = minMjd + (Math.max(0, Math.min(100, start)) / 100) * span;
  const endMjd = minMjd + (Math.max(0, Math.min(100, end)) / 100) * span;
  return { startMjd: Math.min(startMjd, endMjd), endMjd: Math.max(startMjd, endMjd) };
}
