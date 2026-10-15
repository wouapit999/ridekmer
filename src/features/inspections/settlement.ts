/**
 * Return settlement: pure integer-XAF arithmetic comparing the pickup and return inspections.
 * Everything is explainable line by line to the customer and to finance.
 */
export interface SettlementInput {
  pickupMileageKm: number | null;
  returnMileageKm: number | null;
  pickupFuelPercent: number | null;
  returnFuelPercent: number | null;
  rentalDays: number;
  /** Included kilometres per rental day (null/0 = unlimited). */
  kmAllowancePerDay: number | null;
  extraKmRateXaf: number | null;
  /** Estimates of damages recorded at return that were not pre-existing. */
  newDamageEstimatesXaf: number[];
  scheduledEndAt: Date;
  returnedAt: Date;
  lateReturnFeeXafPerDay: number;
  fuelAdjustmentXafPerPercent: number;
  /** Grace period before a late day is counted. */
  lateGraceMinutes?: number;
  depositXaf: number;
}

export interface SettlementLine {
  key: "extraKm" | "fuel" | "damage" | "late";
  amountXaf: number;
  detail: string;
}

export interface Settlement {
  extraKmXaf: number;
  fuelXaf: number;
  damageXaf: number;
  lateXaf: number;
  deductionXaf: number;
  /** Deposit returned to the customer after deductions (never negative). */
  depositRefundXaf: number;
  /** Amount still owed by the customer when deductions exceed the deposit. */
  additionalChargeXaf: number;
  lines: SettlementLine[];
  drivenKm: number | null;
  lateDays: number;
}

export function computeSettlement(input: SettlementInput): Settlement {
  const lines: SettlementLine[] = [];

  let drivenKm: number | null = null;
  let extraKmXaf = 0;
  if (input.pickupMileageKm !== null && input.returnMileageKm !== null) {
    drivenKm = Math.max(0, input.returnMileageKm - input.pickupMileageKm);
    const allowance = (input.kmAllowancePerDay ?? 0) * input.rentalDays;
    const rate = input.extraKmRateXaf ?? 0;
    if (allowance > 0 && rate > 0 && drivenKm > allowance) {
      const extra = drivenKm - allowance;
      extraKmXaf = extra * rate;
      lines.push({ key: "extraKm", amountXaf: extraKmXaf, detail: `${extra} km × ${rate}` });
    }
  }

  let fuelXaf = 0;
  if (
    input.pickupFuelPercent !== null &&
    input.returnFuelPercent !== null &&
    input.returnFuelPercent < input.pickupFuelPercent &&
    input.fuelAdjustmentXafPerPercent > 0
  ) {
    const missing = input.pickupFuelPercent - input.returnFuelPercent;
    fuelXaf = missing * input.fuelAdjustmentXafPerPercent;
    lines.push({
      key: "fuel",
      amountXaf: fuelXaf,
      detail: `${missing} % × ${input.fuelAdjustmentXafPerPercent}`,
    });
  }

  const damageXaf = input.newDamageEstimatesXaf.reduce(
    (sum, n) => sum + Math.max(0, Math.trunc(n)),
    0,
  );
  if (damageXaf > 0) {
    lines.push({
      key: "damage",
      amountXaf: damageXaf,
      detail: `${input.newDamageEstimatesXaf.length} damage(s)`,
    });
  }

  const grace = (input.lateGraceMinutes ?? 60) * 60_000;
  const lateMs = input.returnedAt.getTime() - input.scheduledEndAt.getTime() - grace;
  const lateDays = lateMs > 0 ? Math.ceil(lateMs / 86_400_000) : 0;
  const lateXaf = lateDays * input.lateReturnFeeXafPerDay;
  if (lateXaf > 0) {
    lines.push({
      key: "late",
      amountXaf: lateXaf,
      detail: `${lateDays} day(s) × ${input.lateReturnFeeXafPerDay}`,
    });
  }

  const deductionXaf = extraKmXaf + fuelXaf + damageXaf + lateXaf;
  const depositRefundXaf = Math.max(0, input.depositXaf - deductionXaf);
  const additionalChargeXaf = Math.max(0, deductionXaf - input.depositXaf);
  return {
    extraKmXaf,
    fuelXaf,
    damageXaf,
    lateXaf,
    deductionXaf,
    depositRefundXaf,
    additionalChargeXaf,
    lines,
    drivenKm,
    lateDays,
  };
}
