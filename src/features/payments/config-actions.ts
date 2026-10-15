"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermissionOrThrow } from "@/server/auth/session";
import { resetPaymentRegistry } from "@/server/payments/registry";

import { CREDENTIAL_FIELDS, runProviderValidation, saveProviderConfig } from "./provider-config";

export interface ProviderConfigActionResult {
  ok: boolean;
  message?: string;
  detail?: string;
}

const schema = z.object({
  provider: z.enum(["MTN_MOMO", "ORANGE_MONEY", "CARD"]),
  enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
  environment: z.enum(["mock", "sandbox", "production"]),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\//.test(v), "https required")
    .optional(),
  cardProviderId: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9-]*$/)
    .optional(),
});

export async function saveProviderConfigAction(
  _prev: ProviderConfigActionResult,
  formData: FormData,
): Promise<ProviderConfigActionResult> {
  const { user } = await requirePermissionOrThrow("settings.manage");
  const parsed = schema.safeParse({
    provider: formData.get("provider"),
    enabled: formData.get("enabled") ?? "false",
    environment: formData.get("environment"),
    baseUrl: formData.get("baseUrl") ?? "",
    cardProviderId: formData.get("cardProviderId") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "INVALID" };
  const credentials: Record<string, string> = {};
  for (const field of CREDENTIAL_FIELDS[parsed.data.provider]) {
    const clear = formData.get(`clear:${field}`) === "1";
    const value = String(formData.get(`cred:${field}`) ?? "").trim();
    if (clear) credentials[field] = "__clear__";
    else if (value) credentials[field] = value.slice(0, 500);
  }
  await saveProviderConfig({ ...parsed.data, credentials, actorId: user.id });
  resetPaymentRegistry();
  revalidatePath("/[locale]/admin/settings", "layout");
  return { ok: true, message: "SAVED" };
}

export async function validateProviderAction(
  _prev: ProviderConfigActionResult,
  formData: FormData,
): Promise<ProviderConfigActionResult> {
  const { user } = await requirePermissionOrThrow("settings.manage");
  const provider = z.enum(["MTN_MOMO", "ORANGE_MONEY", "CARD"]).safeParse(formData.get("provider"));
  if (!provider.success) return { ok: false, message: "INVALID" };
  const outcome = await runProviderValidation(provider.data, user.id);
  revalidatePath("/[locale]/admin/settings", "layout");
  return { ok: outcome.ok, message: outcome.code, detail: outcome.detail };
}
