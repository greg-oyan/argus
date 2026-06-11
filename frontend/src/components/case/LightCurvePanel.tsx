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
  axisLabelGranularity,
  formatMjd,
  formatMjdAsDate,
  formatMjdAsMonthYear,
  formatMjdAxisLabel,
  lightCurveMagDomain,
  lightCurveTimeDomain,
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
  storyMode?: boolean;
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
  storyMode: boolean,
) {
  const isSelected = point.pointId === selectedPointId;
  const isHovered = point.pointId === hoveredPointId;
  // The story hero chart spans a wide time domain, so observed points need to
  // read as a clear presence; the expert chart keeps its tighter sizing.
  const baseSize = storyMode ? 8 : 6;
  const hoverSize = storyMode ? 11 : 10;
  const selectSize = storyMode ? 14 : 12;
  return {
    itemStyle: {
      color: isSelected ? chartColors.selected : isHovered ? chartColors.accent : bandColor(point.band),
      opacity: isSelected || isHovered ? 1 : 0.76,
      borderColor: isSelected ? chartColors.selected : chartColors.accent,
      borderWidth: isSelected ? 2 : isHovered ? 1.5 : 0,
    },
    symbol: bandSymbol(point.band),
    symbolSize: isSelected ? selectSize : isHovered ? hoverSize : baseSize,
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
  const when = Number.isFinite(mjd)
    ? `${formatMjdAsDate(mjd)} (MJD ${mjd.toFixed(1)})`
    : "date: n/a";
  const lines = [
    point.seriesName ?? "point",
    when,
    `band: ${data.band ?? "n/a"}`,
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
  storyMode = false,
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
    // Axes fit the full plotted data (all bands + model overlay), not the
    // playback-filtered subset, so the domain stays fixed while playback
    // reveals points inside it instead of rescaling each frame.
    const timeDomain = lightCurveTimeDomain(points);
    const magDomain = lightCurveMagDomain(points);
    const granularity = axisLabelGranularity(timeDomain.max - timeDomain.min);
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
          ...pointEncoding(point, hoveredPointId, selectedPointId, storyMode),
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
      // Extra bottom padding over the shared chartGrid so the x-axis title sits
      // clearly above the dataZoom slider, and a little extra left room for the
      // rotated y-axis title (the two used to collide with the slider/legend).
      grid: { ...chartGrid, left: 64, bottom: 78 },
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
        name: storyMode ? "Time" : "MJD",
        nameLocation: "middle",
        nameGap: 32,
        min: timeDomain.min,
        max: timeDomain.max,
        axisLine: chartAxisLine,
        axisLabel: {
          color: chartColors.muted,
          // Story view shows calendar dates; the expert view keeps raw MJD.
          formatter: storyMode
            ? (value: number) => formatMjdAxisLabel(value, granularity)
            : undefined,
        },
        splitLine: chartSplitLine,
      },
      yAxis: {
        type: "value",
        name: storyMode ? "Brightness (lower = brighter)" : "magnitude",
        // The axis is inverted, so ECharts' default "end" name location lands
        // at the bottom-left where it collided with the dataZoom slider, and a
        // top "start" location collided with the legend on narrow screens.
        // Rotate the title along the axis (the conventional placement) so it
        // clears both.
        nameLocation: "middle",
        nameGap: 44,
        min: magDomain.min,
        max: magDomain.max,
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
          height: 16,
          bottom: 10,
          borderColor: chartColors.grid,
          fillerColor: "rgba(107, 183, 255, 0.13)",
          handleStyle: { color: chartColors.accent },
          textStyle: { color: chartColors.muted },
          // Match the axis: story view labels the zoom handles with dates, the
          // expert view keeps raw MJD.
          labelFormatter: storyMode
            ? (value: number) => formatMjdAxisLabel(value, granularity)
            : undefined,
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
  }, [activePoint, displayedPoints, hasResidualField, hoveredPointId, isComparatorFocused, linkedZoomEnabled, points, reduceMotion, selectedPointId, selectedTimeRange, storyMode]);

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
      className={`argus-panel flex flex-col ${
        storyMode ? "min-h-[420px] sm:min-h-[480px]" : "min-h-[300px]"
      } ${isComparatorFocused ? "argus-panel-focus" : ""}`}
      data-testid="light-curve-panel"
    >
      <div
        className={
          storyMode
            ? "border-b border-workstation-line px-4 py-4 sm:px-6 sm:py-5"
            : "argus-panel-header flex items-center justify-between gap-3"
        }
      >
        {storyMode ? (
          <>
            <h2 className="text-lg font-semibold text-white sm:text-xl">
              Brightness over time
            </h2>
            <p className="mt-1 text-sm leading-6 text-workstation-muted">
              Each dot is one brightness measurement. Press play to watch the
              observations arrive over time.
            </p>
          </>
        ) : (
          <>
            <h2 className="argus-panel-title">Observed Light Curve</h2>
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
          </>
        )}
      </div>
      {bounds ? (
        <div
          className={`flex flex-wrap items-center gap-3 border-b border-workstation-line ${
            storyMode ? "px-4 py-3 sm:px-6 sm:py-4" : "px-3 py-2"
          }`}
        >
          <button
            className={
              storyMode
                ? "argus-focus-visible inline-flex min-h-[44px] items-center gap-2 border border-workstation-accent bg-workstation-accent/15 px-4 py-2 text-sm font-semibold text-white hover:bg-workstation-accent/25"
                : "argus-state-pill argus-focus-visible hover:border-workstation-accent/70 hover:text-workstation-text"
            }
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
            {isPlaying
              ? storyMode
                ? "⏸ Pause"
                : "pause"
              : storyMode
                ? "▶ Watch it change over time"
                : "play"}
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
            {formatMjdAsMonthYear(playbackMjd ?? bounds.max)}
          </span>
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
