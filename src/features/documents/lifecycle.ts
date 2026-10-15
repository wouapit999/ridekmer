/**
 * Pure document-lifecycle rules (no database access) so they can be unit-tested and reused by
 * the cron job, the admin UI and the owner UI.
 */
import { differenceInCalendarDays } from "date-fns";

import { toDouala } from "@/lib/dates";

export type DocStatus =
  "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED" | "EXPIRED" | "REPLACED";

export interface DocumentLike {
  status: DocStatus;
  expiryDate: Date | null;
  lastAlertDaysBefore: number | null;
  documentType: {
    key: string;
    isMandatory: boolean;
    requiresExpiry: boolean;
    blocksVehicleWhenExpired: boolean;
    alertDaysBefore: number[];
  };
}

/** Whole days until expiry, computed on Douala calendar days. Negative when already expired. */
export function daysUntilExpiry(expiryDate: Date, now: Date): number {
  return differenceInCalendarDays(toDouala(expiryDate), toDouala(now));
}

/**
 * Which alert threshold (60, 30, 14, 7, 0 …) should fire today, if any. Fires the smallest
 * configured threshold that is >= daysLeft and has not already been sent (thresholds are sent
 * at most once, in descending order).
 */
export function alertThresholdDue(doc: DocumentLike, now: Date): number | null {
  if (doc.status !== "VERIFIED" || !doc.expiryDate) return null;
  const daysLeft = daysUntilExpiry(doc.expiryDate, now);
  if (daysLeft < 0) return null;
  const thresholds = [...doc.documentType.alertDaysBefore].sort((a, b) => b - a);
  const due = thresholds.filter((t) => t >= daysLeft);
  if (due.length === 0) return null;
  const candidate = Math.min(...due);
  if (doc.lastAlertDaysBefore !== null && doc.lastAlertDaysBefore <= candidate) return null;
  return candidate;
}

export function isExpired(doc: Pick<DocumentLike, "status" | "expiryDate">, now: Date): boolean {
  if (doc.status === "EXPIRED") return true;
  if (!doc.expiryDate) return false;
  return doc.status === "VERIFIED" && daysUntilExpiry(doc.expiryDate, now) < 0;
}

/** Transitions allowed for a reviewer. */
export const REVIEW_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  DRAFT: [],
  SUBMITTED: ["UNDER_REVIEW", "VERIFIED", "REJECTED"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED"],
  VERIFIED: ["EXPIRED", "REPLACED"],
  REJECTED: ["REPLACED"],
  EXPIRED: ["REPLACED"],
  REPLACED: [],
};

export function canTransition(from: DocStatus, to: DocStatus): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

export interface ComplianceResult {
  valid: boolean;
  missing: string[]; // mandatory document type keys with no VERIFIED current version
  expired: string[]; // blocking document type keys whose current version is expired
}

/**
 * Determine whether a vehicle's documentation is valid: every mandatory type must have a
 * VERIFIED, non-expired current document.
 */
export function evaluateVehicleCompliance(
  mandatoryTypes: Array<{ key: string; blocksVehicleWhenExpired: boolean }>,
  documents: Array<Pick<DocumentLike, "status" | "expiryDate"> & { documentType: { key: string } }>,
  now: Date,
  override?: { expiresAt: Date; revokedAt: Date | null } | null,
): ComplianceResult {
  const missing: string[] = [];
  const expired: string[] = [];
  for (const type of mandatoryTypes) {
    // A document counts as "present" once it has been verified, even if it later expired.
    const present = documents.filter(
      (d) => d.documentType.key === type.key && (d.status === "VERIFIED" || d.status === "EXPIRED"),
    );
    if (present.length === 0) {
      missing.push(type.key);
      continue;
    }
    const hasCurrent = present.some((d) => d.status === "VERIFIED" && !isExpired(d, now));
    if (!hasCurrent && type.blocksVehicleWhenExpired) expired.push(type.key);
  }
  const overrideActive = Boolean(override && !override.revokedAt && override.expiresAt > now);
  const valid = missing.length === 0 && (expired.length === 0 || overrideActive);
  return { valid, missing, expired };
}
