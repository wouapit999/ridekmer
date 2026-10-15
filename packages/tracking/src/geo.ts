import { haversineKm } from "./providers/mock";

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Circle: centre + radius in metres. Polygon: ring of [lat, lng] pairs (first ≠ last required). */
export type GeofenceGeometry =
  | { kind: "circle"; center: LatLng; radiusMeters: number }
  | { kind: "polygon"; ring: Array<[number, number]> };

export function parseGeometry(value: unknown): GeofenceGeometry | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.kind === "circle") {
    const c = v.center as Record<string, unknown> | undefined;
    if (!c || typeof c.latitude !== "number" || typeof c.longitude !== "number") return null;
    if (typeof v.radiusMeters !== "number" || v.radiusMeters <= 0) return null;
    return {
      kind: "circle",
      center: { latitude: c.latitude, longitude: c.longitude },
      radiusMeters: v.radiusMeters,
    };
  }
  if (v.kind === "polygon" && Array.isArray(v.ring) && v.ring.length >= 3) {
    const ring = v.ring.filter(
      (p): p is [number, number] =>
        Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number",
    );
    return ring.length >= 3 ? { kind: "polygon", ring } : null;
  }
  return null;
}

/** Ray casting on lat/lng (adequate for city-scale fences; not for polar or antimeridian cases). */
export function pointInPolygon(point: LatLng, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [latI, lngI] = ring[i]!;
    const [latJ, lngJ] = ring[j]!;
    const intersects =
      lngI > point.longitude !== lngJ > point.longitude &&
      point.latitude < ((latJ - latI) * (point.longitude - lngI)) / (lngJ - lngI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(point: LatLng, geometry: GeofenceGeometry): boolean {
  if (geometry.kind === "circle")
    return haversineKm(point, geometry.center) * 1000 <= geometry.radiusMeters;
  return pointInPolygon(point, geometry.ring);
}

export interface GeofenceTransition {
  geofenceId: string;
  type: "GEOFENCE_ENTER" | "GEOFENCE_EXIT";
}

/** Compare the previous inside-set with the new one and emit enter/exit transitions. */
export function geofenceTransitions(
  previousInside: string[],
  nowInside: string[],
): GeofenceTransition[] {
  const prev = new Set(previousInside);
  const now = new Set(nowInside);
  const out: GeofenceTransition[] = [];
  for (const id of now) if (!prev.has(id)) out.push({ geofenceId: id, type: "GEOFENCE_ENTER" });
  for (const id of prev) if (!now.has(id)) out.push({ geofenceId: id, type: "GEOFENCE_EXIT" });
  return out;
}

/** Total distance of an ordered track in km (sum of haversine legs), rounded to 0.1. */
export function trackDistanceKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversineKm(points[i - 1]!, points[i]!);
  return Math.round(total * 10) / 10;
}

/** A vehicle is "stationary" when its latest fix is recent, speed ≈ 0 and ignition is off. */
export function isStationary(
  latest: { recordedAt: Date; speedKmh?: number | null; ignitionOn?: boolean | null } | null,
  now: Date = new Date(),
  maxAgeMinutes = 10,
): boolean {
  if (!latest) return false;
  if (now.getTime() - latest.recordedAt.getTime() > maxAgeMinutes * 60_000) return false;
  if ((latest.speedKmh ?? 0) > 2) return false;
  if (latest.ignitionOn === true) return false;
  return true;
}
