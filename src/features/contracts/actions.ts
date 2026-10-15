"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentSession, requirePermissionOrThrow } from "@/server/auth/session";

import { ContractError, acceptContract, publishTemplateVersion } from "./service";

export interface ContractActionResult {
  ok: boolean;
  message?: string;
}

async function evidence() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

export async function acceptContractAction(
  _prev: ContractActionResult,
  formData: FormData,
): Promise<ContractActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "UNAUTHENTICATED" };
  if (formData.get("accept") !== "1") return { ok: false, message: "ACCEPT_REQUIRED" };
  const contractId = String(formData.get("contractId") ?? "");
  try {
    await acceptContract(contractId, current.user.id, await evidence());
    revalidatePath("/[locale]/account/bookings", "layout");
    return { ok: true, message: "ACCEPTED" };
  } catch (error) {
    if (error instanceof ContractError) return { ok: false, message: error.code };
    throw error;
  }
}

const publishSchema = z.object({
  templateKey: z.string().min(1).max(80),
  locale: z.enum(["fr", "en"]),
  bodyMarkdown: z.string().min(50).max(100_000),
});

export async function publishTemplateVersionAction(
  _prev: ContractActionResult,
  formData: FormData,
): Promise<ContractActionResult> {
  const { user } = await requirePermissionOrThrow("contract.manage");
  const parsed = publishSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "INVALID" };
  try {
    await publishTemplateVersion({ ...parsed.data, authorId: user.id });
    revalidatePath("/[locale]/admin/contracts", "page");
    return { ok: true, message: "PUBLISHED" };
  } catch (error) {
    if (error instanceof ContractError) return { ok: false, message: error.code };
    throw error;
  }
}
