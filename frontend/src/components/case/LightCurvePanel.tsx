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
} from "../../lib/chartInteractions";
import type { LinkedResidualPoint } from "../../lib/chartSeries";
import { useInvestigationStore } from "../../stores/investigationStore";

interface LightCurvePanelProps {
  oid: string;
  points: LinkedResidualPoint[];
  activePoint: LinkedResidualPoint | null;
}

function pointEncoding(
  point: LinkedResidualPoint,
  hoveredPointId: string | null,
  selectedPointId: string | null,
) {
  const isSelected = point.pointId === selectedPointId;
  const isHovered = point.pointId === hoveredPointId;
  return {
    itemStyle: {
      color: isSelected ? chartColors.selected : isHovered ? chartColors.accent : "#8da7bd",
      opacity: isSelected || isHovered ? 1 : 0.76,
      borderColor: isSelected ? chartColors.selected : chartColors.accent,
      borderWidth: isSelected ? 2 : isHovered ? 1.5 : 0,
    },
    symbolSize: isSelected ? 12 : isHovered ? 10 : 6,
  };
}

export function LightCurvePanel({ oid, points, activePoint }: LightCurvePanelProps) {
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const setHoveredPointId = useInvestigationStore((state) => state.setHoveredPointId);
  const setSelectedPointId = useInvestigationStore((state) => state.setSelectedPointId);
  const clearSelectedPointId = useInvestigationStore((state) => state.clearSelectedPointId);

  const option = useMemo<EChartsOption>(() => {
    const observedData = points
      .filter((point) => point.observedMag !== null)
      .map((point) => ({
        ...pointEncoding(point, hoveredPointId, selectedPointId),
        pointId: point.pointId,
        value: [point.mjd, point.observedMag],
      }));
    const modelData = points
      .filter((point) => point.modelMag !== null)
      .map((point) => ({
        pointId: point.pointId,
        value: [point.mjd, point.modelMag],
      }));

    return {
      backgroundColor: "transparent",
      animation: false,
      color: [chartColors.accent, chartColors.model],
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
        name: "magnitude",
        nameGap: 44,
        inverse: true,
        axisLine: chartAxisLine,
        axisLabel: { color: chartColors.muted },
        splitLine: chartSplitLine,
      },
      series: [
        {
          name: "observed r-band",
          type: "scatter",
          data: observedData,
          markLine: activePoint
            ? {
                symbol: "none",
                silent: true,
                label: { show: false },
                lineStyle: { color: chartColors.accent, opacity: 0.7, type: "dashed" },
                data: [{ xAxis: activePoint.mjd }],
              }
            : undefined,
        },
        {
          name: "Gaussian model",
          type: "line",
          showSymbol: false,
          smooth: true,
          data: modelData,
          lineStyle: {
            color: chartColors.model,
            opacity: 0.86,
            width: 2,
          },
        },
      ],
    };
  }, [activePoint, hoveredPointId, points, selectedPointId]);

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
        }
      },
    }),
    [setHoveredPointId, setSelectedPointId],
  );

  if (points.length === 0) {
    return (
      <section className="flex min-h-[300px] flex-col border border-workstation-line bg-workstation-panel/70">
        <div className="border-b border-workstation-line px-4 py-3">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Observed Light Curve
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-workstation-muted">
          No Gaussian residual field is available for linked light-curve plotting.
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[300px] flex-col border border-workstation-line bg-workstation-panel/70">
      <div className="flex items-center justify-between border-b border-workstation-line px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Observed Light Curve
        </h2>
        <p className="font-mono text-xs text-workstation-muted">{oid} r-band residual source</p>
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
