"use server";

import { revalidatePath } from "next/cache";

import { DocumentError, uploadVerificationDocument } from "@/features/documents/service";
import { FileRejectedError } from "@/server/files/service";
import { getCurrentSession } from "@/server/auth/session";

import { getOrCreateCustomerCase, saveCustomerIdentityDetails } from "./service";

export interface VerificationActionResult {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
}

export async function uploadCustomerDocumentAction(
  _prev: VerificationActionResult,
  formData: FormData,
): Promise<VerificationActionResult> {
  const current = await getCurrentSession();
  if (!current) return { ok: false, message: "unauthorized" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, errors: { file: "required" } };
  const typeKey = String(formData.get("typeKey") ?? "");
  if (!["customer_identity_document", "customer_driving_licence"].includes(typeKey))
    return { ok: false, errors: { typeKey: "invalid" } };
  try {
    const { verificationCase } = await getOrCreateCustomerCase(current.user.id);
    const documentNumber = String(formData.get("documentNumber") ?? "");
    const expiryDate = String(formData.get("expiryDate") ?? "");
    await saveCustomerIdentityDetails(
      current.user.id,
      typeKey === "customer_identity_document"
        ? { identityNumber: documentNumber || undefined }
        : {
            drivingLicenceNo: documentNumber || undefined,
            drivingLicenceExpiry: expiryDate || undefined,
          },
    );
    await uploadVerificationDocument({
      verificationCaseId: verificationCase.id,
      typeKey,
      file,
      meta: {
        documentNumber,
        issuer: String(formData.get("issuer") ?? ""),
        issueDate: String(formData.get("issueDate") ?? ""),
        expiryDate,
      },
      actorId: current.user.id,
    });
    revalidatePath("/[locale]/account/documents", "page");
    return { ok: true, message: "uploaded" };
  } catch (error) {
    if (error instanceof DocumentError) return { ok: false, message: error.code };
    if (error instanceof FileRejectedError)
      return { ok: false, message: `FILE_${error.reason.code}` };
    throw error;
  }
}
