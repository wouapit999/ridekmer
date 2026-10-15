import { addDays } from "date-fns";

import { startOfDoualaDay } from "@/lib/dates";
import { db } from "@/server/db";

export async function getDashboardCounts() {
  const now = new Date();
  const dayStart = startOfDoualaDay(now);
  const dayEnd = addDays(dayStart, 1);
  const in30Days = addDays(now, 30);
  const [
    bookingsToday,
    activeRentals,
    availableVehicles,
    vehiclesAwaitingApproval,
    expiringDocuments,
    maintenanceDue,
    paymentsToReconcile,
    pendingRefunds,
    pendingPayouts,
    openIncidents,
    users,
  ] = await Promise.all([
    db.booking.count({
      where: { startAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ["DRAFT", "CANCELLED"] } },
    }),
    db.booking.count({ where: { status: { in: ["ACTIVE", "EXTENSION_REQUESTED"] } } }),
    db.vehicle.count({ where: { status: "ACTIVE", documentsValid: true, deletedAt: null } }),
    db.vehicle.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    db.vehicleDocument.count({
      where: { status: "VERIFIED", expiryDate: { lte: in30Days, gte: now } },
    }),
    db.maintenanceSchedule.count({ where: { isActive: true, nextDueDate: { lte: in30Days } } }),
    db.payment.count({ where: { status: "SUCCESSFUL", reconciledAt: null } }),
    db.refund.count({ where: { status: { in: ["REQUESTED", "PENDING_APPROVAL", "APPROVED"] } } }),
    db.ownerPayout.count({ where: { status: { in: ["PENDING_APPROVAL", "APPROVED"] } } }),
    db.incident.count({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    db.user.count({ where: { deletedAt: null } }),
  ]);
  return {
    bookingsToday,
    activeRentals,
    availableVehicles,
    vehiclesAwaitingApproval,
    expiringDocuments,
    maintenanceDue,
    paymentsToReconcile,
    pendingRefunds,
    pendingPayouts,
    openIncidents,
    users,
  };
}

export async function listUsers(query: string | undefined, page: number, pageSize = 25) {
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
          { phoneNumber: { contains: query } },
        ],
      }
    : {};
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        status: true,
        twoFactorEnabled: true,
        createdAt: true,
        userRoles: { select: { role: { select: { key: true, isStaff: true } } } },
      },
    }),
  ]);
  return { total, users, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getUserDetail(id: string) {
  const [user, roles] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        status: true,
        suspensionReason: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLoginAt: true,
        userRoles: { select: { roleId: true } },
      },
    }),
    db.role.findMany({
      orderBy: { isStaff: "asc" },
      select: { id: true, key: true, name: true, isStaff: true, requiresMfa: true },
    }),
  ]);
  return { user, roles };
}

export async function listAuditLogs(page: number, pageSize = 50) {
  const [total, entries] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);
  return { total, entries, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getSettingsPageData() {
  const [cities, settings, documentTypes] = await Promise.all([
    db.city.findMany({
      orderBy: { sortOrder: "asc" },
      include: { branches: { select: { id: true, nameFr: true, nameEn: true, isActive: true } } },
    }),
    db.systemSetting.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] }),
    db.documentType.findMany({ orderBy: [{ subjectType: "asc" }, { sortOrder: "asc" }] }),
  ]);
  return { cities, settings, documentTypes };
}
