import { beforeAll, describe, expect, it } from "vitest";

import {
  anonymiseUser,
  cancelAccountDeletion,
  buildDataExport,
  PrivacyError,
  processDueDeletions,
  requestAccountDeletion,
} from "@/features/account/privacy";
import { db } from "@/server/db";
import { runHousekeeping } from "@/server/housekeeping";

async function createCustomer(suffix: string) {
  return db.user.create({
    data: {
      name: `Privacy ${suffix}`,
      email: `privacy-${suffix}-${Date.now()}@ridekmer.test`,
      phoneNumber: `+2376${String(Date.now()).slice(-8)}${suffix.length % 10}`.slice(0, 13),
      customerProfile: {
        create: {
          firstName: "Privacy",
          lastName: suffix,
          nationality: "CM",
          identityNumberEnc: "v1:aaa:bbb:ccc",
          identityNumberHash: `hash-${suffix}`,
        },
      },
      sessions: {
        create: [
          {
            token: `tok-live-${suffix}-${Date.now()}`,
            expiresAt: new Date(Date.now() + 3_600_000),
          },
          {
            token: `tok-dead-${suffix}-${Date.now()}`,
            expiresAt: new Date(Date.now() - 3_600_000),
          },
        ],
      },
    },
  });
}

describe("privacy: export, deletion request, anonymisation", () => {
  let userId: string;
  beforeAll(async () => {
    userId = (await createCustomer("a")).id;
  });

  it("export contains profile data but no encrypted columns", async () => {
    const data = await buildDataExport(userId);
    expect(data.user.id).toBe(userId);
    expect(data.user.customerProfile?.firstName).toBe("Privacy");
    expect(JSON.stringify(data)).not.toContain("identityNumberEnc");
    expect(JSON.stringify(data)).not.toContain("v1:aaa");
  });

  it("deletion request freezes the account and can be cancelled", async () => {
    const request = await requestAccountDeletion(userId, "leaving");
    expect(request.status).toBe("REQUESTED");
    const frozen = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(frozen.status).toBe("PENDING_DELETION");
    // Idempotent: a second request returns the open one.
    const again = await requestAccountDeletion(userId);
    expect(again.id).toBe(request.id);

    await cancelAccountDeletion(userId);
    const restored = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(restored.status).toBe("ACTIVE");
    const closed = await db.dataRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(closed.status).toBe("REJECTED");
  });

  it("a user with an in-flight booking cannot be anonymised", async () => {
    const blocked = await createCustomer("b");
    const vehicle = await db.vehicle.findFirst({ where: { status: "ACTIVE" } });
    expect(vehicle).not.toBeNull();
    // Far-future, run-unique window so the exclusion constraint never collides with other tests.
    const offsetDays = 400 + (Math.floor(Date.now() / 1000) % 1000);
    const start = new Date(Date.now() + offsetDays * 86_400_000);
    await db.booking.create({
      data: {
        reference: `RK-PRIV-${Date.now()}`,
        customerId: blocked.id,
        vehicleId: vehicle!.id,
        status: "CONFIRMED",
        rentalDays: 2,
        startAt: start,
        endAt: new Date(start.getTime() + 2 * 86_400_000),
        type: "SELF_DRIVE",
      },
    });
    await expect(requestAccountDeletion(blocked.id)).rejects.toMatchObject({
      code: "ACTIVE_BOOKINGS",
    });
    await expect(anonymiseUser(blocked.id)).rejects.toBeInstanceOf(PrivacyError);
  });

  it("anonymisation removes identity, sessions and credentials but keeps the user row", async () => {
    await requestAccountDeletion(userId);
    const result = await anonymiseUser(userId, null);
    expect(result.alreadyDeleted).toBe(false);
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { customerProfile: true, sessions: true, accounts: true, dataRequests: true },
    });
    expect(user.status).toBe("DELETED");
    expect(user.deletedAt).not.toBeNull();
    expect(user.email).toMatch(/@anonymised\.invalid$/);
    expect(user.phoneNumber).toBeNull();
    expect(user.name).not.toContain("Privacy");
    expect(user.customerProfile?.identityNumberEnc).toBeNull();
    expect(user.customerProfile?.identityNumberHash).toBeNull();
    expect(user.sessions).toHaveLength(0);
    expect(user.accounts).toHaveLength(0);
    expect(user.dataRequests.some((r) => r.status === "COMPLETED")).toBe(true);
    expect(
      user.dataRequests.some((r) => r.status === "REQUESTED" || r.status === "IN_PROGRESS"),
    ).toBe(false);
    const audit = await db.auditLog.findFirst({
      where: { entityId: userId, action: "privacy.deletion.completed" },
    });
    expect(audit).not.toBeNull();
    // Second call is a no-op.
    expect((await anonymiseUser(userId, null)).alreadyDeleted).toBe(true);
  });

  it("processDueDeletions only anonymises requests past the grace period", async () => {
    const fresh = await createCustomer("c");
    await requestAccountDeletion(fresh.id);
    const early = await processDueDeletions(new Date());
    expect(early.completed).toBe(0);
    const late = await processDueDeletions(new Date(Date.now() + 31 * 86_400_000));
    expect(late.completed).toBeGreaterThanOrEqual(1);
    const user = await db.user.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(user.status).toBe("DELETED");
  });
});

describe("housekeeping", () => {
  it("purges expired sessions, verifications and idempotency keys and records an audit row", async () => {
    const user = await createCustomer("h");
    await db.verification.create({
      data: {
        identifier: `hk-${Date.now()}`,
        value: "x",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await db.idempotencyKey.create({
      data: {
        key: `hk-${Date.now()}`,
        scope: "test",
        requestHash: "h",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const result = await runHousekeeping(new Date());
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.verifications).toBeGreaterThanOrEqual(1);
    expect(result.idempotencyKeys).toBeGreaterThanOrEqual(1);
    const sessions = await db.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const audit = await db.auditLog.findFirst({
      where: { action: "cron.housekeeping" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  });
});
