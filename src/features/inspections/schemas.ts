import { z } from "zod";

export const CHECK_AREAS = {
  exterior: ["front", "rear", "left", "right", "roof", "mirrors"],
  interior: ["seats", "dashboard", "floor", "odour"],
  tyres: ["frontLeft", "frontRight", "rearLeft", "rearRight", "spare"],
  lights: ["headlights", "indicators", "brakeLights"],
} as const;
export type CheckGroup = keyof typeof CHECK_AREAS;
export const CHECK_STATES = ["ok", "worn", "damaged", "missing"] as const;

export const DAMAGE_TYPES = ["scratch", "dent", "crack", "chip", "stain", "tear", "other"] as const;
export const DAMAGE_AREAS = [
  "front_bumper",
  "rear_bumper",
  "bonnet",
  "boot",
  "roof",
  "left_front_door",
  "left_rear_door",
  "right_front_door",
  "right_rear_door",
  "left_wing",
  "right_wing",
  "windscreen",
  "rear_window",
  "wheel",
  "interior",
  "other",
] as const;
export const DIAGRAM_VIEWS = ["top", "front", "rear", "left", "right"] as const;

export const inspectionDetailsSchema = z.object({
  inspectionId: z.string().min(1),
  mileageKm: z.coerce.number().int().min(0).max(2_000_000),
  fuelLevelPercent: z.coerce.number().int().min(0).max(100),
  windscreenCondition: z.enum(CHECK_STATES).default("ok"),
  notes: z.string().trim().max(2000).optional(),
  accessories: z.string().trim().max(500).optional(),
  documentsPresent: z.string().trim().max(500).optional(),
});

export const damageSchema = z.object({
  inspectionId: z.string().min(1),
  diagramView: z.enum(DIAGRAM_VIEWS).default("top"),
  markerX: z.coerce.number().min(0).max(1),
  markerY: z.coerce.number().min(0).max(1),
  area: z.enum(DAMAGE_AREAS),
  damageType: z.enum(DAMAGE_TYPES),
  severity: z.enum(["MINOR", "MODERATE", "SEVERE"]).default("MINOR"),
  description: z.string().trim().max(500).optional(),
  isPreExisting: z.coerce.boolean().default(false),
  estimateXaf: z.coerce.number().int().min(0).max(100_000_000).optional(),
});

export const INSPECTION_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"];
