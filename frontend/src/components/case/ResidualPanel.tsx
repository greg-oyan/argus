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
import { timeBounds, timeRangeToPercent, type LinkedResidualPoint } from "../../lib/chartSeries";
import { useInvestigationStore } from "../../stores/investigationStore";

interface ResidualPanelProps {
  oid: string;
  points: LinkedResidualPoint[];
  activePoint: LinkedResidualPoint | null;
  isComparatorFocused?: boolean;
}

function residualColor(value: number): string {
  return value >= 0 ? chartColors.residualPositive : chartColors.residualNegative;
}

function pointEncoding(
  point: LinkedResidualPoint,
  hoveredPointId: string | null,
  selectedPointId: string | null,
) {
  const isSelected = point.pointId === selectedPointId;
  const isHovered = point.pointId === hoveredPointId;
  const magnitude = Math.min(1, Math.abs(point.residualMag) / 1.5);
  return {
    itemStyle: {
      color: isSelected ? chartColors.selected : isHovered ? chartColors.accent : residualColor(point.residualMag),
      opacity: isSelected || isHovered ? 1 : 0.55 + magnitude * 0.35,
      borderColor: isSelected ? chartColors.selected : chartColors.accent,
      borderWidth: isSelected ? 2 : isHovered ? 1.5 : 0,
    },
    symbolSize: isSelected ? 12 : isHovered ? 10 : 5 + magnitude * 4,
  };
}

export function ResidualPanel({
  oid,
  points,
  activePoint,
  isComparatorFocused = false,
}: ResidualPanelProps) {
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
    const residualData = points.map((point) => ({
      ...pointEncoding(point, hoveredPointId, selectedPointId),
      pointId: point.pointId,
      value: [point.mjd, point.residualMag],
    }));
    const markLineData: Array<Record<string, number>> = [{ yAxis: 0 }];
    if (activePoint) {
      markLineData.push({ xAxis: activePoint.mjd });
    }

    return {
      backgroundColor: "transparent",
      animation: false,
      color: [chartColors.accent],
      textStyle: chartTextStyle,
      grid: chartGrid,
      tooltip: {
        trigger: "item",
        backgroundColor: chartColors.panel,
        borderColor: chartColors.grid,
        textStyle: { color: chartColors.text, fontSize: 12 },
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
        name: "residual mag",
        nameGap: 44,
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
        {
          name: "Gaussian residual",
          type: "scatter",
          data: residualData,
          markArea: selectedMarkArea,
          markLine: {
            symbol: "none",
            silent: true,
            label: { show: false },
            lineStyle: { color: chartColors.muted, opacity: 0.78, type: "dashed" },
            data: markLineData,
          },
        },
      ],
    } as EChartsOption;
  }, [activePoint, hoveredPointId, points, selectedPointId, selectedTimeRange]);

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
      <section className="flex min-h-[260px] flex-col border border-workstation-line bg-workstation-panel/70">
        <div className="border-b border-workstation-line px-4 py-3">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Gaussian Residual Field
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-workstation-muted">
          Residual points are not present for this object, so linked residual inspection is unavailable.
        </div>
      </section>
    );
  }

  return (
    <section
      className={`flex min-h-[260px] flex-col border bg-workstation-panel/70 ${
        isComparatorFocused ? "border-workstation-accent/70" : "border-workstation-line"
      }`}
    >
      <div className="flex items-center justify-between border-b border-workstation-line px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Gaussian Residual Field
        </h2>
        <p className="font-mono text-xs text-workstation-muted">{oid} point residuals</p>
      </div>
      <div className="min-h-0 flex-1">
        <ReactECharts
          notMerge
          onChartReady={(chart) => installClearSelectionOnBackgroundClick(chart, clearSelectedPointId)}
          onEvents={onEvents}
          option={option}
          opts={{ renderer: "svg" }}
          style={{ height: "100%", minHeight: 230, width: "100%" }}
        />
      </div>
    </section>
  );
}
