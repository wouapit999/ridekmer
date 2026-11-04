/**
 * Where an in-app notification takes its reader: the page where the action is done. Staff
 * alerts point into the administration; user notifications follow the entity they are about.
 */
const BY_TEMPLATE: Record<string, (id: string, entityType: string | null) => string> = {
  staff_vehicle_review: (id) => `/admin/vehicles/${id}`,
  staff_vehicle_change_request: (id) => `/admin/vehicles/${id}`,
  staff_payment_to_confirm: (id) => `/admin/payments/${id}`,
  staff_refund_approval: (id) => `/admin/payments/${id}`,
  staff_document_review: (id, type) =>
    type === "VerificationCase" ? `/admin/verifications/${id}` : "/admin/documents",
  staff_payout_approval: () => "/admin/payouts",
  staff_expense_approval: () => "/admin/expenses",
  staff_incident: (id) => `/admin/incidents/${id}`,
  staff_extension_request: (id) => `/admin/bookings/${id}`,
  staff_immobilisation_approval: () => "/admin/immobilisation",
  vehicle_changes_requested: (id) => `/owner/vehicles/${id}/edit`,
};

const BY_ENTITY: Record<string, (id: string) => string> = {
  Booking: (id) => `/account/bookings/${id}`,
  Vehicle: (id) => `/owner/vehicles/${id}/edit`,
};

/** The locale-less path a notification opens, or null when it has nowhere to go. */
export function notificationHref(n: {
  templateKey: string;
  entityType: string | null;
  entityId: string | null;
}): string | null {
  if (!n.entityId) return null;
  const byTemplate = BY_TEMPLATE[n.templateKey];
  if (byTemplate) return byTemplate(n.entityId, n.entityType);
  const byEntity = n.entityType ? BY_ENTITY[n.entityType] : undefined;
  return byEntity ? byEntity(n.entityId) : null;
}
