"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentSession } from "@/server/auth/session";
import { enforceRateLimit, RateLimitedError } from "@/server/security/rate-limit";

import type { ActionResult } from "./actions";
import { cancelAccountDeletion, PrivacyError, requestAccountDeletion } from "./privacy";

const deletionSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal("")),
  confirm: z.literal("on"),
});

export async function requestDeletionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "unauthorized" };
  const parsed = deletionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, errors: { confirm: "required" } };
  try {
    await enforceRateLimit("privacy.deletion", current.user.id);
    await requestAccountDeletion(current.user.id, parsed.data.reason || undefined);
  } catch (error) {
    if (error instanceof RateLimitedError) return { ok: false, message: "rateLimited" };
    if (error instanceof PrivacyError) return { ok: false, message: error.code };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "requested" };
}

export async function cancelDeletionAction(): Promise<ActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "unauthorized" };
  await cancelAccountDeletion(current.user.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "cancelled" };
}
