import type { ResidualPoint } from "../../types/casefile";
import { sampledResiduals } from "../../lib/glyphEncoding";

interface ResidualBarcodeProps {
  points: ResidualPoint[];
}

export function ResidualBarcode({ points }: ResidualBarcodeProps) {
  const sampled = sampledResiduals(points);
  if (sampled.length === 0) {
    return (
      <g>
        <line opacity="0.32" stroke="#334250" strokeWidth="1" x1="28" x2="184" y1="121" y2="121" />
        {Array.from({ length: 11 }, (_, index) => (
          <line
            key={index}
            opacity={0.18 + (index % 2) * 0.12}
            stroke="#6f7b86"
            strokeDasharray="2 5"
            strokeWidth="1"
            x1={32 + index * 14}
            x2={37 + index * 14}
            y1="118"
            y2="124"
          />
        ))}
      </g>
    );
  }

  const maxAbs = Math.max(...sampled.map((point) => Math.abs(point.residual_mag)), 0.05);
  return (
    <g>
      <line opacity="0.38" stroke="#445463" strokeWidth="1" x1="28" x2="184" y1="121" y2="121" />
      {sampled.map((point, index) => {
        const x = 30 + (150 * index) / Math.max(1, sampled.length - 1);
        const magnitude = Math.min(18, (Math.abs(point.residual_mag) / maxAbs) * 18);
        const upward = point.residual_mag < 0;
        const y1 = 121;
        const y2 = upward ? 121 - magnitude : 121 + magnitude;
        return (
          <line
            key={`${point.mjd}-${index}`}
            opacity={0.42 + Math.min(0.48, Math.abs(point.residual_mag) / maxAbs)}
            stroke={upward ? "#6bb7ff" : "#d8a84c"}
            strokeLinecap="round"
            strokeWidth={1.2}
            x1={x}
            x2={x}
            y1={y1}
            y2={y2}
          />
        );
      })}
    </g>
  );
}
