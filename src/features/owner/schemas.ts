import { z } from "zod";

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

export const ownerProfileSchema = z
  .object({
    ownerType: z.enum(["INDIVIDUAL", "COMPANY"]),
    displayName: z.string().trim().min(2).max(120),
    firstName: optionalString(80),
    lastName: optionalString(80),
    identityNumber: optionalString(40),
    taxIdentifier: optionalString(40),
    legalName: optionalString(160),
    tradeName: optionalString(160),
    registrationNumber: optionalString(60),
    taxpayerNumber: optionalString(60),
    legalForm: optionalString(60),
    representativeName: optionalString(120),
    representativeTitle: optionalString(80),
    contactEmail: optionalString(200),
    contactPhone: optionalString(32),
  })
  .refine((v) => v.ownerType === "COMPANY" || (v.firstName && v.lastName), {
    message: "names",
    path: ["firstName"],
  })
  .refine((v) => v.ownerType === "INDIVIDUAL" || (v.legalName && v.representativeName), {
    message: "company",
    path: ["legalName"],
  });

export const payoutSchema = z
  .object({
    payoutMethod: z.enum(["MTN_MOBILE_MONEY", "ORANGE_MONEY", "BANK_TRANSFER"]),
    payoutMobileNumber: optionalString(32),
    payoutBankName: optionalString(120),
    payoutBankAccount: optionalString(60),
    payoutAccountName: z.string().trim().min(2).max(120),
  })
  .refine((v) => v.payoutMethod === "BANK_TRANSFER" || Boolean(v.payoutMobileNumber), {
    message: "mobile",
    path: ["payoutMobileNumber"],
  })
  .refine((v) => v.payoutMethod !== "BANK_TRANSFER" || (v.payoutBankName && v.payoutBankAccount), {
    message: "bank",
    path: ["payoutBankAccount"],
  });

export type OwnerProfileInput = z.infer<typeof ownerProfileSchema>;
export type PayoutInput = z.infer<typeof payoutSchema>;

export const OWNER_STEPS = ["profile", "payout", "documents", "agreement", "vehicles"] as const;
export type OwnerStep = (typeof OWNER_STEPS)[number];
