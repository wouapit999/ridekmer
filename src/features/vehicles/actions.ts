"use server";

import { revalidatePath } from "next/cache";

import { DocumentError, uploadVehicleDocument } from "@/features/documents/service";
import { FileRejectedError } from "@/server/files/service";
import { getCurrentSession } from "@/server/auth/session";

import {
  arrangementSchema,
  availabilityBlockSchema,
  basicsSchema,
  equipmentSchema,
  formToObject,
  issuesToErrors,
  locationSchema,
  ownerRequestSchema,
  pricingSchema,
} from "./schemas";
import {
  VehicleError,
  addAvailabilityBlock,
  addVehicleImage,
  createVehicleDraft,
  removeAvailabilityBlock,
  removeVehicleImage,
  requestVehicleChange,
  submitVehicle,
  updateVehicleArrangement,
  updateVehicleBasics,
  updateVehicleEquipment,
  updateVehicleLocation,
  updateVehiclePricing,
} from "./service";

export interface VehicleActionResult {
  ok: boolean;
  message?: string;
  details?: string[];
  errors?: Record<string, string>;
  vehicleId?: string;
}

async function requireUserId() {
  const current = await getCurrentSession();
  if (!current) throw new VehicleError("FORBIDDEN");
  return current.user.id;
}

function fail(error: unknown): VehicleActionResult {
  if (error instanceof VehicleError)
    return { ok: false, message: error.code, details: error.details };
  if (error instanceof DocumentError) return { ok: false, message: error.code };
  if (error instanceof FileRejectedError)
    return { ok: false, message: `FILE_${error.reason.code}` };
  throw error;
}

function revalidate(vehicleId?: string) {
  revalidatePath("/[locale]/owner", "layout");
  if (vehicleId) revalidatePath(`/[locale]/owner/vehicles/${vehicleId}`, "layout");
}

export async function saveBasicsAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = basicsSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    const vehicleId = String(formData.get("vehicleId") ?? "");
    const vehicle = vehicleId
      ? await updateVehicleBasics(vehicleId, userId, parsed.data)
      : await createVehicleDraft(userId, parsed.data);
    revalidate(vehicle.id);
    return { ok: true, vehicleId: vehicle.id };
  } catch (error) {
    return fail(error);
  }
}

export async function saveEquipmentAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const raw = formToObject(formData);
    raw.safetyEquipment = formData.getAll("safetyEquipment[]").map(String);
    const parsed = equipmentSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    const vehicleId = String(formData.get("vehicleId") ?? "");
    await updateVehicleEquipment(vehicleId, userId, parsed.data);
    revalidate(vehicleId);
    return { ok: true, vehicleId };
  } catch (error) {
    return fail(error);
  }
}

export async function saveLocationAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = locationSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    const vehicleId = String(formData.get("vehicleId") ?? "");
    await updateVehicleLocation(vehicleId, userId, parsed.data);
    revalidate(vehicleId);
    return { ok: true, vehicleId };
  } catch (error) {
    return fail(error);
  }
}

export async function savePricingAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = pricingSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    const vehicleId = String(formData.get("vehicleId") ?? "");
    await updateVehiclePricing(vehicleId, userId, parsed.data);
    revalidate(vehicleId);
    return { ok: true, vehicleId };
  } catch (error) {
    return fail(error);
  }
}

export async function saveArrangementAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = arrangementSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    const vehicleId = String(formData.get("vehicleId") ?? "");
    await updateVehicleArrangement(vehicleId, userId, parsed.data);
    revalidate(vehicleId);
    return { ok: true, vehicleId };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadImageAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const vehicleId = String(formData.get("vehicleId") ?? "");
    const files = formData
      .getAll("files")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { ok: false, errors: { files: "required" } };
    for (const file of files) await addVehicleImage(vehicleId, userId, file);
    revalidate(vehicleId);
    return { ok: true, vehicleId };
  } catch (error) {
    return fail(error);
  }
}

export async function removeImageAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const vehicleId = String(formData.get("vehicleId") ?? "");
  await removeVehicleImage(vehicleId, userId, String(formData.get("imageId") ?? ""));
  revalidate(vehicleId);
}

export async function uploadVehicleDocumentAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const vehicleId = String(formData.get("vehicleId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, errors: { file: "required" } };
    // Ownership check happens inside the service through getOwnedVehicle.
    const { getOwnedVehicle } = await import("./service");
    await getOwnedVehicle(vehicleId, userId);
    await uploadVehicleDocument({
      vehicleId,
      typeKey: String(formData.get("typeKey") ?? ""),
      file,
      meta: {
        documentNumber: String(formData.get("documentNumber") ?? ""),
        issuer: String(formData.get("issuer") ?? ""),
        issueDate: String(formData.get("issueDate") ?? ""),
        expiryDate: String(formData.get("expiryDate") ?? ""),
      },
      actorId: userId,
    });
    revalidate(vehicleId);
    return { ok: true, vehicleId };
  } catch (error) {
    return fail(error);
  }
}

export async function submitVehicleAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const vehicleId = String(formData.get("vehicleId") ?? "");
    await submitVehicle(vehicleId, userId);
    revalidate(vehicleId);
    return { ok: true, vehicleId, message: "submitted" };
  } catch (error) {
    return fail(error);
  }
}

export async function ownerRequestAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = ownerRequestSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    const vehicleId = String(formData.get("vehicleId") ?? "");
    await requestVehicleChange(vehicleId, userId, parsed.data.type, parsed.data.reason);
    revalidate(vehicleId);
    return { ok: true, vehicleId, message: "requested" };
  } catch (error) {
    return fail(error);
  }
}

export async function addBlockAction(
  _prev: VehicleActionResult,
  formData: FormData,
): Promise<VehicleActionResult> {
  try {
    const userId = await requireUserId();
    const parsed = availabilityBlockSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
    const vehicleId = String(formData.get("vehicleId") ?? "");
    await addAvailabilityBlock(vehicleId, userId, parsed.data);
    revalidate(vehicleId);
    return { ok: true, vehicleId };
  } catch (error) {
    return fail(error);
  }
}

export async function removeBlockAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const vehicleId = String(formData.get("vehicleId") ?? "");
  await removeAvailabilityBlock(vehicleId, userId, String(formData.get("blockId") ?? ""));
  revalidate(vehicleId);
}
