import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  setActionEmails,
} from "@/features/notifications/queries";
import { db } from "@/server/db";
import { sendTemplatedNotification } from "@/server/notifications";
import { alertStaff, usersWithPermission } from "@/server/notifications/alerts";

let reviewerId: string;
let otherReviewerId: string;
let customerId: string;

beforeAll(async () => {
  const role = await db.role.findFirstOrThrow({
    where: {
      key: { not: "super_administrator" },
      rolePermissions: { some: { permission: { key: "vehicle.review" } } },
    },
  });
  const [reviewer, other, customer] = await Promise.all(
    ["reviewer", "reviewer-2", "customer"].map((name) =>
      db.user.create({
        data: { email: `alert-${name}-${randomUUID()}@ridekmer.test`, name, preferredLocale: "en" },
      }),
    ),
  );
  await db.userRole.createMany({
    data: [
      { userId: reviewer.id, roleId: role.id },
      { userId: other.id, roleId: role.id },
    ],
  });
  reviewerId = reviewer.id;
  otherReviewerId = other.id;
  customerId = customer.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("action alerts", () => {
  it("finds the staff holding a permission, not other users", async () => {
    const ids = (await usersWithPermission("vehicle.review")).map((u) => u.id);
    expect(ids).toContain(reviewerId);
    expect(ids).not.toContain(customerId);
  });

  it("alerts each holder in-app and by e-mail once, skipping the actor and opted-out e-mails", async () => {
    await setActionEmails(otherReviewerId, false);
    const vehicleId = `veh-${randomUUID()}`;
    const alert = () =>
      alertStaff("vehicle.review", {
        templateKey: "staff_vehicle_review",
        variables: { vehicle: "Toyota Prado (LT 123 AB)", owner: "Paul" },
        entityType: "Vehicle",
        entityId: vehicleId,
        dedupeKey: `test_vehicle_submitted:${vehicleId}`,
        exceptUserId: customerId,
      });
    await alert();
    await alert(); // a retry or a double click does not alert twice

    const mine = await db.notification.findMany({
      where: { userId: reviewerId, entityId: vehicleId },
      orderBy: { channel: "asc" },
    });
    expect(mine.map((n) => n.channel)).toEqual(["EMAIL", "IN_APP"]);
    expect(mine[1].subject).toBe("Vehicle to review");
    expect(mine[1].body).toBe("Toyota Prado (LT 123 AB) submitted by Paul");
    expect(mine[0].body).toContain(`/en/admin/vehicles/${vehicleId}`);

    const theirs = await db.notification.findMany({
      where: { userId: otherReviewerId, entityId: vehicleId },
    });
    expect(theirs.map((n) => n.channel)).toEqual(["IN_APP"]);
    expect(
      await db.notification.count({ where: { userId: customerId, entityId: vehicleId } }),
    ).toBe(0);
  });

  it("lists e-mails to a user under the bell and tracks what was read", async () => {
    const bookingId = `bk-${randomUUID()}`;
    await sendTemplatedNotification({
      templateKey: "booking_created",
      channel: "EMAIL",
      locale: "en",
      to: "customer@ridekmer.test",
      userId: customerId,
      variables: { name: "Customer", reference: "RK-TEST", vehicle: "Kia Rio", amount: "XAF 1" },
      entityType: "Booking",
      entityId: bookingId,
    });
    const before = await countUnreadNotifications(customerId);
    expect(before).toBeGreaterThanOrEqual(1);
    const [latest] = await listNotifications(customerId, 1);
    expect(latest.entityId).toBe(bookingId);
    expect(latest.readAt).toBeNull();

    expect(await markNotificationRead(reviewerId, latest.id)).toBeNull(); // not theirs
    expect((await markNotificationRead(customerId, latest.id))?.id).toBe(latest.id);
    expect(await countUnreadNotifications(customerId)).toBe(before - 1);
    await markAllNotificationsRead(customerId);
    expect(await countUnreadNotifications(customerId)).toBe(0);
  });
});
