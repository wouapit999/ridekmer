/**
 * Permission catalogue and default role definitions. Shared by the seed script, the
 * authorisation layer and the administration UI. Keys are stable identifiers; never rename
 * one without a data migration.
 */
export const PERMISSIONS = {
  // Vehicles
  "vehicle.create": { category: "vehicle", description: "Create or submit a vehicle" },
  "vehicle.view_all": { category: "vehicle", description: "View every vehicle, not only own" },
  "vehicle.update_any": { category: "vehicle", description: "Edit any vehicle" },
  "vehicle.review": { category: "vehicle", description: "Review submitted vehicles" },
  "vehicle.approve": { category: "vehicle", description: "Approve or reject vehicles" },
  "vehicle.suspend": { category: "vehicle", description: "Suspend or reinstate vehicles" },
  "vehicle.withdraw": { category: "vehicle", description: "Withdraw vehicles from the fleet" },
  // Bookings
  "booking.create": { category: "booking", description: "Create bookings" },
  "booking.view_all": { category: "booking", description: "View every booking" },
  "booking.cancel": { category: "booking", description: "Cancel bookings" },
  "booking.override": { category: "booking", description: "Force booking state transitions" },
  "booking.assign_chauffeur": { category: "booking", description: "Assign chauffeurs" },
  "booking.handover": { category: "booking", description: "Perform pickup/return handover" },
  // Payments, refunds, payouts
  "payment.view": { category: "payment", description: "View payment details" },
  "payment.record_manual": {
    category: "payment",
    description: "Record cash or bank-transfer payments",
  },
  "payment.reconcile": { category: "payment", description: "Reconcile provider transactions" },
  "refund.request": { category: "payment", description: "Request refunds" },
  "refund.approve": { category: "payment", description: "Approve refunds" },
  "payout.request": { category: "payout", description: "Request owner payouts" },
  "payout.approve": { category: "payout", description: "Approve owner payouts" },
  "payout.process": { category: "payout", description: "Execute approved payouts" },
  "ledger.view": { category: "payment", description: "View ledger entries" },
  // Tracking
  "tracking.view_current": { category: "tracking", description: "View current vehicle location" },
  "tracking.view_history": { category: "tracking", description: "View location history" },
  "tracking.export": { category: "tracking", description: "Export location data" },
  "tracking.manage_devices": {
    category: "tracking",
    description: "Register and assign tracker devices",
  },
  // Documents and verification
  "document.verify": { category: "document", description: "Verify or reject documents" },
  "document.configure_types": { category: "document", description: "Configure document types" },
  "document.override_block": {
    category: "document",
    description: "Override an expired-document block",
  },
  "customer.verify": { category: "verification", description: "Approve customer identity" },
  "owner.verify": { category: "verification", description: "Approve owner KYC/KYB" },
  // Contracts
  "contract.manage": { category: "contract", description: "Manage contract templates" },
  "contract.view_all": { category: "contract", description: "View every generated contract" },
  // Inspections, maintenance, incidents
  "inspection.perform": { category: "operations", description: "Perform vehicle inspections" },
  "inspection.view_all": { category: "operations", description: "View every inspection" },
  "maintenance.manage": { category: "operations", description: "Manage maintenance" },
  "expense.approve": { category: "operations", description: "Approve expenses" },
  "incident.manage": { category: "operations", description: "Manage incidents" },
  "incident.resolve": {
    category: "operations",
    description: "Resolve incidents and allocate deductions",
  },
  // Reporting
  "report.view": { category: "report", description: "View reports and dashboards" },
  "report.export": { category: "report", description: "Export reports as CSV" },
  // Settings and users
  "settings.manage": { category: "admin", description: "Manage system settings, cities, fees" },
  "promo.manage": { category: "admin", description: "Manage promotional codes" },
  "user.view_all": { category: "admin", description: "View every user" },
  "user.manage_roles": { category: "admin", description: "Assign roles and permissions" },
  "user.suspend": { category: "admin", description: "Suspend or reinstate users" },
  "audit.view": { category: "admin", description: "View audit logs" },
  "support.manage": { category: "support", description: "Manage support cases" },
  "notification.manage_templates": {
    category: "admin",
    description: "Manage notification templates",
  },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  isStaff: boolean;
  requiresMfa: boolean;
  permissions: PermissionKey[] | "*";
}

const OPERATIONS_BASE: PermissionKey[] = [
  "vehicle.view_all",
  "vehicle.review",
  "booking.view_all",
  "booking.create",
  "booking.cancel",
  "booking.assign_chauffeur",
  "booking.handover",
  "payment.view",
  "document.verify",
  "customer.verify",
  "inspection.perform",
  "inspection.view_all",
  "incident.manage",
  "support.manage",
  "tracking.view_current",
  "report.view",
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: "customer",
    name: "Customer",
    description: "Rents vehicles",
    isStaff: false,
    requiresMfa: false,
    permissions: ["booking.create"],
  },
  {
    key: "vehicle_owner",
    name: "Vehicle owner",
    description: "Entrusts or lists vehicles",
    isStaff: false,
    requiresMfa: false,
    permissions: ["vehicle.create", "payout.request"],
  },
  {
    key: "chauffeur",
    name: "Chauffeur",
    description: "Drives chauffeur-driven bookings",
    isStaff: false,
    requiresMfa: false,
    permissions: ["booking.handover"],
  },
  {
    key: "delivery_agent",
    name: "Delivery agent",
    description: "Delivers and collects vehicles",
    isStaff: true,
    requiresMfa: false,
    permissions: ["booking.handover", "inspection.perform", "tracking.view_current"],
  },
  {
    key: "vehicle_inspector",
    name: "Vehicle inspector",
    description: "Performs pickup, return and periodic inspections",
    isStaff: true,
    requiresMfa: false,
    permissions: [
      "inspection.perform",
      "inspection.view_all",
      "incident.manage",
      "vehicle.view_all",
    ],
  },
  {
    key: "operations_agent",
    name: "Operations agent",
    description: "Day-to-day operations",
    isStaff: true,
    requiresMfa: true,
    permissions: OPERATIONS_BASE,
  },
  {
    key: "support_agent",
    name: "Customer-support agent",
    description: "Handles customer and owner support",
    isStaff: true,
    requiresMfa: true,
    permissions: [
      "support.manage",
      "booking.view_all",
      "payment.view",
      "refund.request",
      "user.view_all",
    ],
  },
  {
    key: "fleet_manager",
    name: "Fleet manager",
    description: "Manages vehicles, maintenance and telematics",
    isStaff: true,
    requiresMfa: true,
    permissions: [
      ...OPERATIONS_BASE,
      "vehicle.approve",
      "vehicle.suspend",
      "vehicle.withdraw",
      "vehicle.update_any",
      "owner.verify",
      "maintenance.manage",
      "expense.approve",
      "incident.resolve",
      "tracking.view_history",
      "tracking.manage_devices",
      "document.override_block",
      "report.export",
    ],
  },
  {
    key: "finance_officer",
    name: "Finance officer",
    description: "Payments, refunds, payouts and ledger",
    isStaff: true,
    requiresMfa: true,
    permissions: [
      "payment.view",
      "payment.record_manual",
      "payment.reconcile",
      "refund.request",
      "refund.approve",
      "payout.approve",
      "payout.process",
      "ledger.view",
      "expense.approve",
      "report.view",
      "report.export",
      "booking.view_all",
    ],
  },
  {
    key: "administrator",
    name: "Administrator",
    description: "Full operational administration",
    isStaff: true,
    requiresMfa: true,
    permissions: ALL_PERMISSION_KEYS.filter((k) => k !== "payout.process"),
  },
  {
    key: "super_administrator",
    name: "Super administrator",
    description: "Unrestricted access",
    isStaff: true,
    requiresMfa: true,
    permissions: "*",
  },
];

export const STAFF_ROLE_KEYS = ROLE_DEFINITIONS.filter((r) => r.isStaff).map((r) => r.key);
export const SUPER_ADMIN_ROLE = "super_administrator";
