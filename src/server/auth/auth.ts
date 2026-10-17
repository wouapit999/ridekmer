import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber, twoFactor } from "better-auth/plugins";

import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { parsePhone } from "@/lib/phone";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";

import { trustedOrigins } from "./origins";
import { assignDefaultRole } from "./rbac";

const env = getEnv();
const OTP_MINUTES = 5;
const m = env.APP_ENV === "production" ? 1 : env.AUTH_RATE_LIMIT_MULTIPLIER;

function localeFor(user: { preferredLocale?: string | null } | undefined): "fr" | "en" {
  return user?.preferredLocale === "en" ? "en" : "fr";
}

/**
 * Better Auth configuration (ADR-004).
 * - Email + password with scrypt hashing (library default), minimum 10 characters.
 * - Phone-number OTP sign-up/sign-in through the SMS provider abstraction.
 * - TOTP two-factor with backup codes; enforced for staff by `requireStaffMfa`.
 * - Database sessions with rotation (updateAge) and a short cookie cache.
 * - Rate limiting stored in the database so it works across serverless instances.
 */
export const auth = betterAuth({
  appName: "RideKmer",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: trustedOrigins({
    appUrl: env.NEXT_PUBLIC_APP_URL,
    extra: env.AUTH_TRUSTED_ORIGINS,
    vercel: {
      VERCEL_URL: process.env.VERCEL_URL,
      VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendTemplatedNotification({
        templateKey: "password_reset",
        channel: "EMAIL",
        locale: localeFor(user as { preferredLocale?: string }),
        to: user.email,
        userId: user.id,
        variables: { name: user.name, url },
        sensitive: true,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (user.email.endsWith("@phone.ridekmer.invalid")) return; // phone-only accounts
      try {
        await sendTemplatedNotification({
          templateKey: "account_verification",
          channel: "EMAIL",
          locale: localeFor(user as { preferredLocale?: string }),
          to: user.email,
          userId: user.id,
          variables: { name: user.name, url },
          sensitive: true,
        });
      } catch (error) {
        // A misconfigured e-mail provider must not block sign-up; the Notification row and
        // /api/health (`email:log`) expose the problem, and the user can re-request later.
        logger.error("auth.verification_email_failed", { userId: user.id, error });
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    // Per-IP limits are deliberately generous because many Cameroonian users share carrier-grade
    // NAT addresses; per-account lockout is tracked in docs/OPEN_ITEMS.md (Milestone 8).
    customRules: {
      "/sign-in/email": { window: 60, max: 20 * m },
      "/sign-up/email": { window: 60, max: 10 * m },
      "/phone-number/send-otp": { window: 60, max: 5 * m },
      "/phone-number/verify": { window: 60, max: 10 * m },
      "/two-factor/verify-totp": { window: 60, max: 10 * m },
      "/request-password-reset": { window: 60, max: 5 * m },
    },
  },
  user: {
    additionalFields: {
      preferredLocale: { type: "string", required: false, defaultValue: "fr", input: true },
      status: { type: "string", required: false, defaultValue: "ACTIVE", input: false },
    },
    changeEmail: { enabled: false },
  },
  advanced: {
    cookiePrefix: "ridekmer",
    useSecureCookies: env.APP_ENV !== "development",
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // User.phoneNumber is unique; without this check the database violation surfaces
          // as a bare "Failed to create user". One person holds one account and can be
          // customer and owner at the same time.
          const phone = (user as { phoneNumber?: string | null }).phoneNumber;
          if (phone) {
            const taken = await db.user.findUnique({
              where: { phoneNumber: phone },
              select: { id: true },
            });
            if (taken) {
              throw new APIError("UNPROCESSABLE_ENTITY", {
                message: "PHONE_NUMBER_ALREADY_IN_USE",
              });
            }
          }
          return { data: user };
        },
        after: async (user) => {
          await assignDefaultRole(user.id);
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { status: true },
          });
          if (user && user.status !== "ACTIVE") {
            logger.warn("auth.sign_in_blocked_suspended", { userId: session.userId });
            return false;
          }
          await db.user
            .update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } })
            .catch(() => undefined);
          return { data: session };
        },
      },
    },
  },
  plugins: [
    twoFactor({
      issuer: "RideKmer",
      skipVerificationOnEnable: false,
      otpOptions: {
        sendOTP: async ({ user, otp }) => {
          const typedUser = user as {
            id: string;
            email: string;
            phoneNumber?: string | null;
            preferredLocale?: string;
          };
          const channel = typedUser.phoneNumber ? "SMS" : "EMAIL";
          await sendTemplatedNotification({
            templateKey: "otp",
            channel,
            locale: localeFor(typedUser),
            to: typedUser.phoneNumber ?? typedUser.email,
            userId: typedUser.id,
            variables: { code: otp, minutes: OTP_MINUTES },
            sensitive: true,
          });
        },
      },
    }),
    phoneNumber({
      otpLength: 6,
      expiresIn: OTP_MINUTES * 60,
      allowedAttempts: 5,
      phoneNumberValidator: (value) => parsePhone(value) !== null,
      sendOTP: async ({ phoneNumber: to, code }) => {
        await sendTemplatedNotification({
          templateKey: "otp",
          channel: "SMS",
          locale: "fr",
          to,
          variables: { code, minutes: OTP_MINUTES },
          sensitive: true,
        });
      },
      signUpOnVerification: {
        // Phone-only accounts get a placeholder email on a reserved, non-routable domain.
        getTempEmail: (phone) => `${phone.replace(/\D/g, "")}@phone.ridekmer.invalid`,
        getTempName: (phone) => phone,
      },
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
export type Session = Auth["$Infer"]["Session"];
