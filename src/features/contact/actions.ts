"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";

import { humanReference } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { parsePhone } from "@/lib/phone";
import { getCurrentSession } from "@/server/auth/session";
import { db } from "@/server/db";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  category: z.enum(["booking", "owner", "corporate", "incident", "other"]),
  message: z.string().trim().min(10).max(4000),
  website: z.string().max(0).optional(), // honeypot
});

export interface ContactState {
  ok: boolean;
  reference?: string;
  errors?: Partial<Record<keyof z.infer<typeof schema>, string>>;
  failed?: boolean;
}

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: ContactState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof schema>;
      errors[key] = issue.code;
    }
    return { ok: false, errors };
  }
  if (parsed.data.website) return { ok: true, reference: "RK-OK" }; // bot: pretend success

  const phone = parsed.data.phone ? parsePhone(parsed.data.phone)?.e164 : undefined;
  const locale = await getLocale();
  const session = await getCurrentSession();
  try {
    const supportCase = await db.supportCase.create({
      data: {
        reference: humanReference("SC"),
        requesterId: session?.user.id,
        category: parsed.data.category,
        subject: `${parsed.data.category}: ${parsed.data.name}`,
        description: parsed.data.message,
        contactEmail: parsed.data.email,
        contactPhone: phone,
        locale,
      },
    });
    return { ok: true, reference: supportCase.reference };
  } catch (error) {
    logger.error("contact.submit_failed", { error });
    return { ok: false, failed: true };
  }
}
