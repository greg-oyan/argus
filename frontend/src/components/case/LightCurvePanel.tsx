import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { useReducedMotion } from "framer-motion";
import {
  chartAxisLine,
  chartColors,
  chartGrid,
  chartSplitLine,
  chartTextStyle,
} from "../../lib/chartTheme";
import {
  installClearSelectionOnBackgroundClick,
  pointIdFromChartEvent,
  selectedTimeRangeFromDataZoomEvent,
} from "../../lib/chartInteractions";
import {
  formatMjd,
  timeBounds,
  timeRangeToPercent,
  type LinkedLightCurvePoint,
} from "../../lib/chartSeries";
import { useInvestigationStore } from "../../stores/investigationStore";

interface LightCurvePanelProps {
  oid: string;
  points: LinkedLightCurvePoint[];
  activePoint: LinkedLightCurvePoint | null;
  isComparatorFocused?: boolean;
  hasResidualField?: boolean;
}

function bandColor(band: string | null): string {
  if (band === "g") return chartColors.residualNegative;
  if (band === "r") return chartColors.residualPositive;
  return "#8da7bd";
}

function bandSymbol(band: string | null): string {
  if (band === "g") return "circle";
  if (band === "r") return "diamond";
  return "rect";
}

function pointEncoding(
  point: LinkedLightCurvePoint,
  hoveredPointId: string | null,
  selectedPointId: string | null,
) {
  const isSelected = point.pointId === selectedPointId;
  const isHovered = point.pointId === hoveredPointId;
  return {
    itemStyle: {
      color: isSelected ? chartColors.selected : isHovered ? chartColors.accent : bandColor(point.band),
      opacity: isSelected || isHovered ? 1 : 0.76,
      borderColor: isSelected ? chartColors.selected : chartColors.accent,
      borderWidth: isSelected ? 2 : isHovered ? 1.5 : 0,
    },
    symbol: bandSymbol(point.band),
    symbolSize: isSelected ? 12 : isHovered ? 10 : 6,
  };
}

function tooltipFormatter(params: unknown): string {
  const point = params as {
    data?: {
      band?: string | null;
      magerr?: number | null;
      sourceType?: string;
      value?: [number, number];
    };
    seriesName?: string;
  };
  const data = point.data ?? {};
  const [mjd, mag] = data.value ?? [Number.NaN, Number.NaN];
  const lines = [
    point.seriesName ?? "point",
    `band: ${data.band ?? "n/a"}`,
    `MJD: ${Number.isFinite(mjd) ? mjd.toFixed(5) : "n/a"}`,
    `mag: ${Number.isFinite(mag) ? mag.toFixed(3) : "n/a"}`,
    `magerr: ${typeof data.magerr === "number" && Number.isFinite(data.magerr) ? data.magerr.toFixed(3) : "n/a"}`,
    `source: ${data.sourceType ?? "observed"}`,
  ];
  return lines.join("<br/>");
}

export function LightCurvePanel({
  oid,
  points,
  activePoint,
  isComparatorFocused = false,
  hasResidualField = false,
}: LightCurvePanelProps) {
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const selectedTimeRange = useInvestigationStore((state) => state.selectedTimeRange);
  const linkedZoomEnabled = useInvestigationStore((state) => state.linkedZoomEnabled);
  const setHoveredPointId = useInvestigationStore((state) => state.setHoveredPointId);
  const setSelectedPointId = useInvestigationStore((state) => state.setSelectedPointId);
  const setSelectedTimeRange = useInvestigationStore((state) => state.setSelectedTimeRange);
  const setLinkedZoomEnabled = useInvestigationStore((state) => state.setLinkedZoomEnabled);
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const clearSelectedPointId = useInvestigationStore((state) => state.clearSelectedPointId);
  const reduceMotion = useReducedMotion();
  const animateInitialRef = useRef(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMjd, setPlaybackMjd] = useState<number | null>(null);
  const bounds = useMemo(() => timeBounds(points), [points]);
  const playbackEpochs = useMemo(
    () => Array.from(new Set(points.map((point) => point.mjd))).sort((a, b) => a - b),
    [points],
  );
  const displayedPoints = useMemo(
    () => (playbackMjd == null ? points : points.filter((point) => point.mjd <= playbackMjd)),
    [playbackMjd, points],
  );

  useEffect(() => {
    setIsPlaying(false);
    setPlaybackMjd(null);
  }, [oid]);

  useEffect(() => {
    if (!isPlaying || playbackEpochs.length === 0 || reduceMotion) {
      return undefined;
    }
    let frame = 0;
    const startedAt = performance.now();
    const startIndex =
      playbackMjd == null
        ? 0
        : Math.max(0, playbackEpochs.findIndex((mjd) => mjd >= playbackMjd));
    const remaining = Math.max(1, playbackEpochs.length - 1 - startIndex);
    const durationMs = Math.max(6000, Math.min(10000, remaining * 95));

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 1.8);
      const index = Math.min(
        playbackEpochs.length - 1,
        startIndex + Math.round(eased * remaining),
      );
      setPlaybackMjd(playbackEpochs[index]);
      if (progress >= 1) {
        setIsPlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying, playbackEpochs, playbackMjd, reduceMotion]);

  const option = useMemo(() => {
    const initialAnimation = !reduceMotion && animateInitialRef.current;
    const zoom = timeRangeToPercent(points, linkedZoomEnabled ? selectedTimeRange : null);
    const rangeStart = selectedTimeRange?.startMjd;
    const rangeEnd = selectedTimeRange?.endMjd;
    const selectedMarkArea =
      rangeStart != null && rangeEnd != null
        ? {
            silent: true,
            itemStyle: { color: "rgba(107, 183, 255, 0.08)" },
            data: [[{ xAxis: rangeStart }, { xAxis: rangeEnd }]],
          }
        : undefined;
    const observedPoints = displayedPoints.filter((point) => point.observedMag !== null);
    const observedBands = Array.from(
      new Set(observedPoints.map((point) => point.band ?? "unknown")),
    ).sort();
    const observedSeries = observedBands.map((band, index) => ({
      name: `${band}-band observed`,
      type: "scatter",
      data: observedPoints
        .filter((point) => (point.band ?? "unknown") === band)
        .map((point) => ({
          ...pointEncoding(point, hoveredPointId, selectedPointId),
          band: point.band,
          magerr: point.magerr,
          pointId: point.pointId,
          sourceType: hasResidualField ? "residual-backed observation" : "observed detection",
          value: [point.mjd, point.observedMag as number],
        })),
      markArea: index === 0 ? selectedMarkArea : undefined,
      markLine:
        index === 0 && activePoint
          ? {
              symbol: "none",
              silent: true,
              label: { show: false },
              lineStyle: { color: chartColors.accent, opacity: 0.7, type: "dashed" },
              data: [{ xAxis: activePoint.mjd }],
            }
          : undefined,
    }));
    const modelData = displayedPoints
      .filter((point) => point.modelMag !== null)
      .map((point) => ({
        band: point.band,
        sourceType: "Gaussian model",
        pointId: point.pointId,
        value: [point.mjd, point.modelMag as number],
      }));

    return {
      backgroundColor: "transparent",
      animation: initialAnimation,
      animationDuration: initialAnimation ? 240 : 0,
      animationEasing: "cubicOut",
      color: [chartColors.accent, chartColors.model],
      textStyle: chartTextStyle,
      grid: chartGrid,
      legend: {
        top: 6,
        right: 16,
        textStyle: { color: chartColors.muted, fontSize: 11 },
        itemWidth: 9,
        itemHeight: 9,
      },
      tooltip: {
        trigger: "item",
        backgroundColor: chartColors.panel,
        borderColor: chartColors.grid,
        textStyle: { color: chartColors.text, fontSize: 12 },
        formatter: tooltipFormatter,
      },
      xAxis: {
        type: "value",
        name: "MJD",
        nameLocation: "middle",
        nameGap: 28,
        axisLine: chartAxisLine,
        axisLabel: { color: chartColors.muted },
        splitLine: chartSplitLine,
      },
      yAxis: {
        type: "value",
        name: "magnitude",
        nameGap: 44,
        inverse: true,
        axisLine: chartAxisLine,
        axisLabel: { color: chartColors.muted },
        splitLine: chartSplitLine,
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          start: zoom.start,
          end: zoom.end,
        },
        {
          type: "slider",
          xAxisIndex: 0,
          filterMode: "none",
          start: zoom.start,
          end: zoom.end,
          height: 14,
          bottom: 8,
          borderColor: chartColors.grid,
          fillerColor: "rgba(107, 183, 255, 0.13)",
          handleStyle: { color: chartColors.accent },
          textStyle: { color: chartColors.muted },
        },
      ],
      series: [
        ...observedSeries.map((series) => ({
          ...series,
          animationDelay: initialAnimation
            ? (index: number) => Math.min(index * 12, 600)
            : 0,
        })),
        {
          name: "Gaussian model",
          type: "line",
          showSymbol: false,
          smooth: true,
          data: modelData,
          animationDelay: initialAnimation ? Math.min(observedPoints.length * 12, 600) : 0,
          lineStyle: {
            color: chartColors.model,
            opacity: isComparatorFocused ? 1 : 0.86,
            width: isComparatorFocused ? 3 : 2,
          },
        },
      ],
    } as EChartsOption;
  }, [activePoint, displayedPoints, hasResidualField, hoveredPointId, isComparatorFocused, linkedZoomEnabled, points, reduceMotion, selectedPointId, selectedTimeRange]);

  const onEvents = useMemo(
    () => ({
      mouseover: (params: unknown) => {
        const pointId = pointIdFromChartEvent(params);
        if (pointId) {
          setHoveredPointId(pointId);
        }
      },
      mouseout: (params: unknown) => {
        if (pointIdFromChartEvent(params)) {
          setHoveredPointId(null);
        }
      },
      globalout: () => setHoveredPointId(null),
      click: (params: unknown) => {
        const pointId = pointIdFromChartEvent(params);
        if (pointId) {
          setSelectedPointId(pointId);
          setFocusedPanelKey("point");
        }
      },
      datazoom: (params: unknown) => {
        if (!linkedZoomEnabled) {
          return;
        }
        const bounds = timeBounds(points);
        if (!bounds) {
          return;
        }
        setSelectedTimeRange(selectedTimeRangeFromDataZoomEvent(params, bounds.min, bounds.max));
        setFocusedPanelKey("selected_window");
      },
    }),
    [linkedZoomEnabled, points, setFocusedPanelKey, setHoveredPointId, setSelectedPointId, setSelectedTimeRange],
  );

  if (points.length === 0) {
    return (
      <section className="argus-panel flex min-h-[300px] flex-col">
        <div className="argus-panel-header">
          <h2 className="argus-panel-title">
            Observed Light Curve
          </h2>
        </div>
        <div className="p-4">
          <div className="argus-missing-state">
            No point-level light-curve data is available for linked plotting. The rest of the
            case-file evidence remains available for inspection.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`argus-panel flex min-h-[300px] flex-col ${
        isComparatorFocused ? "argus-panel-focus" : ""
      }`}
      data-testid="light-curve-panel"
    >
      <div className="argus-panel-header flex items-center justify-between gap-3">
        <h2 className="argus-panel-title">
          Observed Light Curve
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="font-mono text-xs text-workstation-muted">
            {activePoint
              ? `linked MJD ${activePoint.mjd.toFixed(3)}`
              : playbackMjd == null
                ? hasResidualField
                  ? `${oid} r-band residual source`
                  : `${oid} observed detections`
                : `revealed through MJD ${formatMjd(playbackMjd)}`}
          </p>
          <button
            className={`argus-state-pill ${linkedZoomEnabled ? "argus-state-pill-active" : ""}`}
            onClick={() => {
              setLinkedZoomEnabled(!linkedZoomEnabled);
              if (linkedZoomEnabled) {
                setSelectedTimeRange(null);
              }
            }}
            type="button"
          >
            linked {linkedZoomEnabled ? "on" : "off"}
          </button>
        </div>
      </div>
      {bounds ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-workstation-line px-3 py-2">
          <button
            className="argus-state-pill hover:border-workstation-accent/70 hover:text-workstation-text"
            onClick={() => {
              if (reduceMotion) {
                setPlaybackMjd(bounds.max);
                setIsPlaying(false);
                return;
              }
              setPlaybackMjd(playbackMjd ?? bounds.min);
              setIsPlaying(!isPlaying);
            }}
            type="button"
          >
            {isPlaying ? "pause" : "play"}
          </button>
          <input
            aria-label="Detection playback MJD"
            className="min-w-[180px] flex-1 accent-workstation-accent"
            max={bounds.max}
            min={bounds.min}
            onChange={(event) => {
              setIsPlaying(false);
              setPlaybackMjd(Number(event.target.value));
            }}
            step="0.001"
            type="range"
            value={playbackMjd ?? bounds.max}
          />
          <button
            className="argus-state-pill hover:border-workstation-accent/70 hover:text-workstation-text"
            onClick={() => {
              setIsPlaying(false);
              setPlaybackMjd(null);
            }}
            type="button"
          >
            show all
          </button>
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-workstation-muted">
            {displayedPoints.length}/{points.length} points
          </span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ReactECharts
          notMerge
          onChartReady={(chart) => {
            installClearSelectionOnBackgroundClick(chart, clearSelectedPointId);
            animateInitialRef.current = false;
          }}
          onEvents={onEvents}
          option={option}
          opts={{ renderer: "svg" }}
          style={{ height: "100%", minHeight: 270, width: "100%" }}
        />
      </div>
    </section>
  );
}
