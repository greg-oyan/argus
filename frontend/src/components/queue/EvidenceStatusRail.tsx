import type { EvidenceRailItem } from "../../lib/glyphEncoding";

interface EvidenceStatusRailProps {
  items: EvidenceRailItem[];
}

function stateStyle(state: EvidenceRailItem["state"]): { fill: string; opacity: number; stroke: string } {
  if (state === "available") {
    return { fill: "#80c990", opacity: 0.84, stroke: "#9be0a8" };
  }
  if (state === "limited") {
    return { fill: "#d8a84c", opacity: 0.78, stroke: "#e4bd6d" };
  }
  return { fill: "#26323f", opacity: 0.72, stroke: "#51606e" };
}

export function EvidenceStatusRail({ items }: EvidenceStatusRailProps) {
  return (
    <g>
      <line opacity="0.45" stroke="#263442" strokeWidth="1" x1="230" x2="230" y1="38" y2="126" />
      {items.map((item, index) => {
        const y = 44 + index * 18;
        const style = stateStyle(item.state);
        return (
          <g key={item.key}>
            <circle
              cx="230"
              cy={y}
              fill={style.fill}
              opacity={style.opacity}
              r={5.2}
              stroke={style.stroke}
              strokeWidth="1"
            />
            <text
              fill="#aeb7c2"
              fontFamily="ui-monospace, SFMono-Regular, Consolas, monospace"
              fontSize="7"
              textAnchor="middle"
              x="230"
              y={y + 2.4}
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
