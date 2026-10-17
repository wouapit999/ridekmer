"use server";

import { revalidatePath } from "next/cache";

import { requirePermissionOrThrow } from "@/server/auth/session";

import { addSampleVehicles, removeSampleVehicles } from "./sample-cars";

export interface SampleCarsResult {
  ok: boolean;
  message?: "added" | "removed" | "noCity" | "confirm" | "error";
  count?: number;
}

function refresh() {
  revalidatePath("/[locale]/admin", "layout");
  revalidatePath("/[locale]/cars", "page");
}

export async function addSampleCarsAction(): Promise<SampleCarsResult> {
  const { user } = await requirePermissionOrThrow("settings.manage");
  try {
    const { added } = await addSampleVehicles(user.id);
    refresh();
    return { ok: true, message: "added", count: added };
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CITY")
      return { ok: false, message: "noCity" };
    return { ok: false, message: "error" };
  }
}

export async function removeSampleCarsAction(
  _prev: SampleCarsResult,
  formData: FormData,
): Promise<SampleCarsResult> {
  const { user } = await requirePermissionOrThrow("settings.manage");
  if (formData.get("confirm") !== "on") return { ok: false, message: "confirm" };
  const { removed } = await removeSampleVehicles(user.id);
  refresh();
  return { ok: true, message: "removed", count: removed };
}
