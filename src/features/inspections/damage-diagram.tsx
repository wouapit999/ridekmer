"use client";

import { useState } from "react";

/**
 * RideKmer's own simplified top-view vehicle outline. Clicking records normalised (0..1)
 * coordinates which the damage form submits as markerX/markerY. Existing markers are shown.
 */
export interface DamageMarker {
  id: string;
  x: number;
  y: number;
  severity: "MINOR" | "MODERATE" | "SEVERE";
  isPreExisting: boolean;
}

const COLOUR: Record<DamageMarker["severity"], string> = {
  MINOR: "#d97706",
  MODERATE: "#ea580c",
  SEVERE: "#dc2626",
};

export function DamageDiagram({
  markers,
  interactive,
  label,
}: {
  markers: DamageMarker[];
  interactive?: boolean;
  label: string;
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setPoint({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
  };
  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 200 400"
        role={interactive ? "button" : "img"}
        aria-label={label}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        className={`w-full max-w-xs rounded-lg border border-sand-200 bg-white ${interactive ? "cursor-crosshair" : ""}`}
      >
        {/* body */}
        <rect
          x="30"
          y="20"
          width="140"
          height="360"
          rx="40"
          fill="#f6f1ea"
          stroke="#9a8c7a"
          strokeWidth="3"
        />
        {/* cabin */}
        <rect
          x="50"
          y="110"
          width="100"
          height="180"
          rx="18"
          fill="#ffffff"
          stroke="#9a8c7a"
          strokeWidth="2"
        />
        {/* windscreen / rear window */}
        <path d="M55 115 L145 115 L135 150 L65 150 Z" fill="#dbe7f0" stroke="#9a8c7a" />
        <path d="M65 250 L135 250 L145 285 L55 285 Z" fill="#dbe7f0" stroke="#9a8c7a" />
        {/* wheels */}
        {[
          [22, 70],
          [162, 70],
          [22, 300],
          [162, 300],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="16" height="46" rx="6" fill="#4b4b4b" />
        ))}
        {/* mirrors */}
        <rect x="16" y="150" width="14" height="10" rx="3" fill="#9a8c7a" />
        <rect x="170" y="150" width="14" height="10" rx="3" fill="#9a8c7a" />
        <text x="100" y="14" textAnchor="middle" fontSize="11" fill="#6b6b6b">
          FRONT
        </text>
        <text x="100" y="396" textAnchor="middle" fontSize="11" fill="#6b6b6b">
          REAR
        </text>
        {markers.map((m) => (
          <g key={m.id}>
            <circle
              cx={m.x * 200}
              cy={m.y * 400}
              r="9"
              fill={COLOUR[m.severity]}
              fillOpacity={m.isPreExisting ? 0.45 : 0.9}
              stroke="#fff"
              strokeWidth="2"
            />
          </g>
        ))}
        {point ? (
          <circle
            cx={point.x * 200}
            cy={point.y * 400}
            r="10"
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="3"
          />
        ) : null}
      </svg>
      {interactive ? (
        <>
          <input type="hidden" name="markerX" value={point?.x ?? ""} />
          <input type="hidden" name="markerY" value={point?.y ?? ""} />
        </>
      ) : null}
    </div>
  );
}
