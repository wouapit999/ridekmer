"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

import { DocumentError, uploadVerificationDocument } from "@/features/documents/service";
import { FileRejectedError } from "@/server/files/service";
import { getCurrentSession } from "@/server/auth/session";
import { issuesToErrors, formToObject } from "@/features/vehicles/schemas";

import { ownerProfileSchema, payoutSchema } from "./schemas";
import {
  OwnerError,
  acceptOwnerAgreement,
  ensureVerificationCase,
  getOwnerProfile,
  markDocumentsStepDone,
  saveOwnerProfile,
  savePayoutDetails,
} from "./service";

export interface OwnerActionResult {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

async function requireOwner() {
  const current = await getCurrentSession();
  if (!current) throw new OwnerError("NO_PROFILE");
  return current.user;
}

function fail(error: unknown): OwnerActionResult {
  if (error instanceof OwnerError) return { ok: false, message: error.code };
  if (error instanceof DocumentError) return { ok: false, message: error.code };
  if (error instanceof FileRejectedError)
    return { ok: false, message: `FILE_${error.reason.code}` };
  throw error;
}

export async function saveOwnerProfileAction(
  _prev: OwnerActionResult,
  formData: FormData,
): Promise<OwnerActionResult> {
  try {
    const user = await requireOwner();
    const parsed = ownerProfileSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    await saveOwnerProfile(user.id, parsed.data);
    revalidatePath("/[locale]/owner", "layout");
    return { ok: true, message: "saved" };
  } catch (error) {
    return fail(error);
  }
}

export async function savePayoutAction(
  _prev: OwnerActionResult,
  formData: FormData,
): Promise<OwnerActionResult> {
  try {
    const user = await requireOwner();
    const parsed = payoutSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    await savePayoutDetails(user.id, parsed.data);
    revalidatePath("/[locale]/owner", "layout");
    return { ok: true, message: "saved" };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadOwnerDocumentAction(
  _prev: OwnerActionResult,
  formData: FormData,
): Promise<OwnerActionResult> {
  try {
    const user = await requireOwner();
    const profile = await getOwnerProfile(user.id);
    if (!profile) return { ok: false, message: "NO_PROFILE" };
    const file = formData.get("file");
    const typeKey = String(formData.get("typeKey") ?? "");
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, errors: { file: "required" } };
    const kycCase = await ensureVerificationCase(
      profile.id,
      profile.ownerType === "COMPANY" ? "COMPANY_KYB" : "OWNER_KYC",
    );
    await uploadVerificationDocument({
      verificationCaseId: kycCase.id,
      typeKey,
      file,
      meta: {
        documentNumber: String(formData.get("documentNumber") ?? ""),
        issuer: String(formData.get("issuer") ?? ""),
        issueDate: String(formData.get("issueDate") ?? ""),
        expiryDate: String(formData.get("expiryDate") ?? ""),
      },
      actorId: user.id,
    });
    revalidatePath("/[locale]/owner", "layout");
    return { ok: true, message: "uploaded" };
  } catch (error) {
    return fail(error);
  }
}

export async function completeOwnerDocumentsAction(): Promise<void> {
  const user = await requireOwner();
  await markDocumentsStepDone(user.id);
  revalidatePath("/[locale]/owner", "layout");
  redirect({ href: "/owner/onboarding?step=agreement", locale: await getLocale() });
}

export async function acceptOwnerAgreementAction(
  _prev: OwnerActionResult,
  formData: FormData,
): Promise<OwnerActionResult> {
  try {
    const user = await requireOwner();
    if (!formData.get("accept")) return { ok: false, errors: { accept: "required" } };
    const locale = (await getLocale()) === "en" ? "en" : "fr";
    const h = await headers();
    await acceptOwnerAgreement(user.id, locale, {
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    });
    revalidatePath("/[locale]/owner", "layout");
    return { ok: true, message: "accepted" };
  } catch (error) {
    return fail(error);
  }
}
