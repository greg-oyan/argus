import type { BehaviorKind, SparsityEncoding } from "../../lib/glyphEncoding";

interface BehaviorTraceProps {
  kind: BehaviorKind;
  sparsity: SparsityEncoding;
}

const smoothPath = "M 42 78 C 72 30, 128 30, 158 78";
const irregularPath = "M 34 78 L 48 56 L 62 71 L 77 45 L 93 83 L 109 52 L 127 72 L 143 47 L 162 78";
const sparseSegments = ["M 42 76 L 58 66", "M 84 58 L 98 62", "M 132 69 L 150 60"];

export function BehaviorTrace({ kind, sparsity }: BehaviorTraceProps) {
  const stroke = kind === "repeated_or_irregular" ? "#d8a84c" : "#6bb7ff";
  const strokeWidth = kind === "insufficient_data" ? 1.3 : 2.3;
  const dotCount = sparsity.detectionDots;
  const dots = Array.from({ length: dotCount }, (_, index) => {
    const x = 38 + (128 * index) / Math.max(1, dotCount - 1);
    const y =
      kind === "repeated_or_irregular"
        ? 64 + Math.sin(index * 1.7) * 16
        : kind === "smooth_bump"
          ? 78 - Math.sin((Math.PI * index) / Math.max(1, dotCount - 1)) * 30
          : 70 + ((index % 3) - 1) * 8;
    return { x, y };
  });

  return (
    <g opacity={sparsity.opacity}>
      {kind === "insufficient_data" ? (
        sparseSegments.map((path) => (
          <path
            d={path}
            fill="none"
            key={path}
            stroke="#6f7b86"
            strokeDasharray="6 8"
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
        ))
      ) : (
        <path
          d={kind === "repeated_or_irregular" ? irregularPath : smoothPath}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      )}
      {dots.map((dot, index) => (
        <circle
          cx={dot.x}
          cy={dot.y}
          fill={stroke}
          key={`${dot.x}-${index}`}
          opacity={kind === "insufficient_data" ? 0.35 : 0.55}
          r={1.3}
        />
      ))}
      {sparsity.gapFraction > 0.22 ? (
        <rect
          fill="#05070a"
          height="54"
          opacity={0.72}
          rx="2"
          width={Math.min(26, 8 + sparsity.gapFraction * 34)}
          x={98}
          y={37}
        />
      ) : null}
    </g>
  );
}
