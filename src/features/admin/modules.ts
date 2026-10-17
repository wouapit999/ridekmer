import type { PermissionKey } from "@/server/auth/permissions";

/**
 * Every task area of the administration, in one place. The admin navigation and the
 * dashboard's "What you can do" overview both read this list, so a new admin page only has
 * to be declared here. `anyOf` lists the permissions that unlock the area; an empty list
 * means every staff member sees it.
 */
export const ADMIN_MODULE_GROUPS = [
  "operations",
  "fleet",
  "compliance",
  "finance",
  "administration",
] as const;
export type AdminModuleGroup = (typeof ADMIN_MODULE_GROUPS)[number];

export type DashboardCountKey =
  | "bookingsToday"
  | "activeRentals"
  | "availableVehicles"
  | "vehiclesAwaitingApproval"
  | "expiringDocuments"
  | "maintenanceDue"
  | "paymentsToReconcile"
  | "pendingRefunds"
  | "pendingPayouts"
  | "openIncidents"
  | "users";

export interface AdminModule {
  key: string;
  href: string;
  group: AdminModuleGroup;
  anyOf: PermissionKey[];
  /** Shown in the sidebar (secondary pages are reached from the overview and their parent). */
  nav: boolean;
  /** Dashboard counter shown as "to do" on the overview card. */
  pending?: DashboardCountKey;
}

export const ADMIN_MODULES: readonly AdminModule[] = [
  {
    key: "bookings",
    href: "/admin/bookings",
    group: "operations",
    anyOf: ["booking.view_all"],
    nav: true,
    pending: "bookingsToday",
  },
  {
    key: "incidents",
    href: "/admin/incidents",
    group: "operations",
    anyOf: ["incident.manage"],
    nav: true,
    pending: "openIncidents",
  },
  {
    key: "maintenance",
    href: "/admin/maintenance",
    group: "operations",
    anyOf: ["maintenance.manage"],
    nav: true,
    pending: "maintenanceDue",
  },
  {
    key: "contracts",
    href: "/admin/contracts",
    group: "operations",
    anyOf: ["contract.view_all"],
    nav: true,
  },

  {
    key: "vehicles",
    href: "/admin/vehicles",
    group: "fleet",
    anyOf: ["vehicle.view_all"],
    nav: true,
    pending: "vehiclesAwaitingApproval",
  },
  {
    key: "fleet",
    href: "/admin/fleet",
    group: "fleet",
    anyOf: ["tracking.view_current"],
    nav: true,
  },
  {
    key: "devices",
    href: "/admin/devices",
    group: "fleet",
    anyOf: ["tracking.manage_devices"],
    nav: false,
  },
  {
    key: "geofences",
    href: "/admin/geofences",
    group: "fleet",
    anyOf: ["tracking.manage_devices"],
    nav: false,
  },
  {
    key: "immobilisation",
    href: "/admin/immobilisation",
    group: "fleet",
    anyOf: ["immobilisation.request", "immobilisation.approve"],
    nav: false,
  },
  {
    key: "trackingAccess",
    href: "/admin/fleet/access",
    group: "fleet",
    anyOf: ["audit.view"],
    nav: false,
  },

  {
    key: "documents",
    href: "/admin/documents",
    group: "compliance",
    anyOf: ["document.verify"],
    nav: true,
    pending: "expiringDocuments",
  },
  {
    key: "verifications",
    href: "/admin/verifications",
    group: "compliance",
    anyOf: ["customer.verify", "owner.verify"],
    nav: true,
  },
  {
    key: "dataRequests",
    href: "/admin/data-requests",
    group: "compliance",
    anyOf: ["user.view_all"],
    nav: true,
  },
  { key: "audit", href: "/admin/audit", group: "compliance", anyOf: ["audit.view"], nav: true },

  { key: "finance", href: "/admin/finance", group: "finance", anyOf: ["report.view"], nav: true },
  {
    key: "payments",
    href: "/admin/payments",
    group: "finance",
    anyOf: ["payment.view"],
    nav: true,
    pending: "paymentsToReconcile",
  },
  {
    key: "refunds",
    href: "/admin/refunds",
    group: "finance",
    anyOf: ["refund.request", "refund.approve"],
    nav: true,
    pending: "pendingRefunds",
  },
  {
    key: "payouts",
    href: "/admin/payouts",
    group: "finance",
    anyOf: ["payout.request", "payout.approve", "payout.process"],
    nav: true,
    pending: "pendingPayouts",
  },
  {
    key: "expenses",
    href: "/admin/expenses",
    group: "finance",
    anyOf: ["expense.approve"],
    nav: true,
  },
  {
    key: "ledger",
    href: "/admin/finance/ledger",
    group: "finance",
    anyOf: ["ledger.view"],
    nav: false,
  },
  { key: "reports", href: "/admin/reports", group: "finance", anyOf: ["report.view"], nav: true },

  {
    key: "users",
    href: "/admin/users",
    group: "administration",
    anyOf: ["user.view_all"],
    nav: true,
    pending: "users",
  },
  {
    key: "settings",
    href: "/admin/settings",
    group: "administration",
    anyOf: ["settings.manage"],
    nav: true,
  },
  {
    key: "paymentSettings",
    href: "/admin/settings/payments",
    group: "administration",
    anyOf: ["settings.manage"],
    nav: false,
  },
  {
    key: "samples",
    href: "/admin/samples",
    group: "administration",
    anyOf: ["settings.manage"],
    nav: true,
  },
];

export function canOpenModule(module: AdminModule, permissions: ReadonlySet<string>): boolean {
  return module.anyOf.length === 0 || module.anyOf.some((p) => permissions.has(p));
}
