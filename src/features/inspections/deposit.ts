import { requestRefund } from "@/features/payments/refunds";
import { PAID_STATUSES } from "@/features/payments/service";
import { recordAudit } from "@/server/audit";
import { db } from "@/server/db";

import { InspectionError } from "./service";
import type { Settlement } from "./settlement";

/**
 * Deposit release after the return inspection: opens a refund request for the deposit net of
 * deductions (finance approves it, money never moves here) and records any additional charge
 * as a pending payment to collect. Idempotent per booking.
 */
export async function settleReturnDeposit(bookingId: string, actorId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      inspections: {
        where: { type: "RETURN", status: { in: ["SUBMITTED", "ACKNOWLEDGED"] } },
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
      payments: {
        where: { purpose: "RENTAL", status: { in: PAID_STATUSES } },
        orderBy: { confirmedAt: "desc" },
      },
      priceSnapshots: { orderBy: { sequence: "desc" }, take: 1 },
    },
  });
  if (!booking) throw new InspectionError("NOT_FOUND");
  if (!["COMPLETED", "DISPUTED"].includes(booking.status))
    throw new InspectionError("BOOKING_STATUS");
  if (booking.depositSettledAt) throw new InspectionError("ALREADY_SETTLED");
  const inspection = booking.inspections[0];
  if (!inspection) throw new InspectionError("NOT_FOUND", "return inspection missing");
  const settlement = inspection.settlement as unknown as Settlement | null;
  const deductionXaf = inspection.deductionXaf;
  const paidDeposit = booking.payments.reduce((sum, p) => sum + p.depositXaf, 0);
  const refundXaf = Math.max(0, paidDeposit - deductionXaf);
  const additionalChargeXaf = Math.max(0, deductionXaf - paidDeposit);

  const refunds = [];
  let remaining = refundXaf;
  for (const payment of booking.payments) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, payment.depositXaf);
    if (amount <= 0) continue;
    refunds.push(
      await requestRefund({
        paymentId: payment.id,
        amountXaf: amount,
        reason: `deposit release ${booking.reference}: deduction ${deductionXaf} XAF`,
        requestedById: actorId,
        bookingId: booking.id,
      }),
    );
    remaining -= amount;
  }

  let additionalPayment = null;
  if (additionalChargeXaf > 0) {
    const sequence = (await db.payment.count({ where: { bookingId: booking.id } })) + 1;
    additionalPayment = await db.payment.create({
      data: {
        bookingId: booking.id,
        purpose: "ADDITIONAL_CHARGE",
        method: "CASH",
        provider: "manual-cash",
        providerEnvironment: "production",
        status: "PENDING",
        amountXaf: additionalChargeXaf,
        idempotencyKey: `pay_${booking.id}_ADDITIONAL_${sequence}`,
        description: `Return charges ${booking.reference}`,
        recordedById: actorId,
        metadata: { settlement: settlement ? JSON.parse(JSON.stringify(settlement)) : null },
      },
    });
  }
  await db.booking.update({ where: { id: booking.id }, data: { depositSettledAt: new Date() } });
  await recordAudit({
    actorId,
    action: "booking.deposit.settle",
    entityType: "Booking",
    entityId: booking.id,
    after: {
      paidDeposit,
      deductionXaf,
      refundXaf,
      additionalChargeXaf,
      inspectionId: inspection.id,
    },
  });
  return { refundXaf, additionalChargeXaf, deductionXaf, refunds, additionalPayment };
}
