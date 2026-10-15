/**
 * Dependency-free map: a grid of raster tiles (OpenStreetMap by default, configurable through
 * MAP_TILE_URL_TEMPLATE) with SVG markers and an optional track overlay. Server component, no
 * client JavaScript, works under the strict CSP (img-src https:).
 */
import { getEnv } from "@/lib/env";

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  tone?: "brand" | "good" | "warn" | "danger";
}

const TILE = 256;

function lngToX(lng: number, z: number) {
  return ((lng + 180) / 360) * 2 ** z;
}
function latToY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

function tileUrl(template: string, z: number, x: number, y: number) {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

const COLOURS = { brand: "#1d4ed8", good: "#15803d", warn: "#b45309", danger: "#b91c1c" };

export function StaticMap({
  markers,
  track,
  width = 640,
  height = 420,
  zoom,
  title,
}: {
  markers: MapMarker[];
  track?: Array<{ latitude: number; longitude: number }>;
  width?: number;
  height?: number;
  zoom?: number;
  title: string;
}) {
  const env = getEnv();
  const template = env.MAP_TILE_URL_TEMPLATE;
  const points = [...markers, ...(track ?? [])];
  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-sand-300 text-sm text-sand-600">
        {title}
      </div>
    );
  }
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const centre = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
  let z = zoom ?? 12;
  if (zoom === undefined) {
    // Pick the largest zoom that keeps every point inside the viewport.
    for (z = 15; z > 3; z -= 1) {
      const spanX =
        (Math.max(...lngs.map((l) => lngToX(l, z))) - Math.min(...lngs.map((l) => lngToX(l, z)))) *
        TILE;
      const spanY =
        (Math.max(...lats.map((l) => latToY(l, z))) - Math.min(...lats.map((l) => latToY(l, z)))) *
        TILE;
      if (spanX < width * 0.8 && spanY < height * 0.8) break;
    }
  }
  const cx = lngToX(centre.longitude, z) * TILE;
  const cy = latToY(centre.latitude, z) * TILE;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const tiles: Array<{ x: number; y: number; px: number; py: number }> = [];
  const maxTile = 2 ** z;
  for (let tx = Math.floor(left / TILE); tx * TILE < left + width; tx += 1) {
    for (let ty = Math.floor(top / TILE); ty * TILE < top + height; ty += 1) {
      if (ty < 0 || ty >= maxTile) continue;
      tiles.push({
        x: ((tx % maxTile) + maxTile) % maxTile,
        y: ty,
        px: tx * TILE - left,
        py: ty * TILE - top,
      });
    }
  }
  const project = (p: { latitude: number; longitude: number }) => ({
    x: lngToX(p.longitude, z) * TILE - left,
    y: latToY(p.latitude, z) * TILE - top,
  });
  const path =
    track && track.length > 1
      ? track
          .map(
            (p, i) => `${i === 0 ? "M" : "L"}${project(p).x.toFixed(1)},${project(p).y.toFixed(1)}`,
          )
          .join(" ")
      : null;
  const osmLink = `https://www.openstreetmap.org/#map=${z}/${centre.latitude.toFixed(5)}/${centre.longitude.toFixed(5)}`;
  return (
    <figure className="space-y-1">
      <div
        className="relative overflow-hidden rounded-xl border border-sand-200 bg-sand-100"
        style={{ width: "100%", maxWidth: width, aspectRatio: `${width} / ${height}` }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
          className="block h-auto w-full"
        >
          {tiles.map((t) => (
            <image
              key={`${t.x}-${t.y}`}
              href={tileUrl(template, z, t.x, t.y)}
              x={t.px}
              y={t.py}
              width={TILE}
              height={TILE}
            />
          ))}
          {path ? (
            <path
              d={path}
              fill="none"
              stroke="#1d4ed8"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.85"
            />
          ) : null}
          {markers.map((m) => {
            const p = project(m);
            return (
              <g key={m.id} transform={`translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`}>
                <circle r="9" fill={COLOURS[m.tone ?? "brand"]} stroke="#fff" strokeWidth="2.5" />
                <text
                  y="-14"
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill="#1f2937"
                  stroke="#fff"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="text-xs text-sand-600">
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          className="underline"
          target="_blank"
          rel="noreferrer noopener"
        >
          OpenStreetMap contributors
        </a>{" "}
        ·{" "}
        <a href={osmLink} className="underline" target="_blank" rel="noreferrer noopener">
          zoom {z}
        </a>
      </figcaption>
    </figure>
  );
}
