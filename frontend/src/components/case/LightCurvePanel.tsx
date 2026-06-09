import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
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
import { timeBounds, timeRangeToPercent, type LinkedLightCurvePoint } from "../../lib/chartSeries";
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
  const setHoveredPointId = useInvestigationStore((state) => state.setHoveredPointId);
  const setSelectedPointId = useInvestigationStore((state) => state.setSelectedPointId);
  const setSelectedTimeRange = useInvestigationStore((state) => state.setSelectedTimeRange);
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const clearSelectedPointId = useInvestigationStore((state) => state.clearSelectedPointId);

  const option = useMemo(() => {
    const zoom = timeRangeToPercent(points, selectedTimeRange);
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
    const observedPoints = points.filter((point) => point.observedMag !== null);
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
    const modelData = points
      .filter((point) => point.modelMag !== null)
      .map((point) => ({
        band: point.band,
        sourceType: "Gaussian model",
        pointId: point.pointId,
        value: [point.mjd, point.modelMag as number],
      }));

    return {
      backgroundColor: "transparent",
      animation: false,
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
        ...observedSeries,
        {
          name: "Gaussian model",
          type: "line",
          showSymbol: false,
          smooth: true,
          data: modelData,
          lineStyle: {
            color: chartColors.model,
            opacity: isComparatorFocused ? 1 : 0.86,
            width: isComparatorFocused ? 3 : 2,
          },
        },
      ],
    } as EChartsOption;
  }, [activePoint, hasResidualField, hoveredPointId, isComparatorFocused, points, selectedPointId, selectedTimeRange]);

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
        const bounds = timeBounds(points);
        if (!bounds) {
          return;
        }
        setSelectedTimeRange(selectedTimeRangeFromDataZoomEvent(params, bounds.min, bounds.max));
        setFocusedPanelKey("selected_window");
      },
    }),
    [points, setFocusedPanelKey, setHoveredPointId, setSelectedPointId, setSelectedTimeRange],
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
    >
      <div className="argus-panel-header flex items-center justify-between gap-3">
        <h2 className="argus-panel-title">
          Observed Light Curve
        </h2>
        <p className="font-mono text-xs text-workstation-muted">
          {activePoint
            ? `linked MJD ${activePoint.mjd.toFixed(3)}`
            : hasResidualField
              ? `${oid} r-band residual source`
              : `${oid} observed detections`}
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <ReactECharts
          notMerge
          onChartReady={(chart) => installClearSelectionOnBackgroundClick(chart, clearSelectedPointId)}
          onEvents={onEvents}
          option={option}
          opts={{ renderer: "svg" }}
          style={{ height: "100%", minHeight: 270, width: "100%" }}
        />
      </div>
    </section>
  );
}
