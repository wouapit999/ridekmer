import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";

const suffix = randomUUID().slice(0, 8);
const phone = `+2376${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const emails = [`phone-a-${suffix}@ridekmer.test`, `phone-b-${suffix}@ridekmer.test`];

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

describe("sign-up with a mobile number already in use", () => {
  it("creates the first account and rejects the second with a specific reason", async () => {
    const first = await auth.api.signUpEmail({
      body: {
        email: emails[0]!,
        password: "Passw0rd-long-enough",
        name: "First",
        phoneNumber: phone,
      },
    });
    expect(first.user.email).toBe(emails[0]);

    await expect(
      auth.api.signUpEmail({
        body: {
          email: emails[1]!,
          password: "Passw0rd-long-enough",
          name: "Second",
          phoneNumber: phone,
        },
      }),
    ).rejects.toMatchObject({
      status: "UNPROCESSABLE_ENTITY",
      body: { message: "PHONE_NUMBER_ALREADY_IN_USE" },
    });

    expect(await db.user.findUnique({ where: { email: emails[1] } })).toBeNull();
  });
});
