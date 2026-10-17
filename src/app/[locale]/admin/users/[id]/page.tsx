import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/alert";
import { getUserDetail } from "@/features/admin/queries";
import { UserAdminForms } from "@/features/admin/user-admin-forms";
import { enumLabel } from "@/lib/i18n-enum";
import { requirePermission } from "@/server/auth/session";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function AdminUserDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { user: actor, access } = await requirePermission("user.view_all", `/admin/users/${id}`);
  const { user, roles } = await getUserDetail(id);
  if (!user) notFound();
  const t = await getTranslations("admin.users");
  const te = await getTranslations("enums");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-sand-900">{t("detailTitle", { name: user.name })}</h1>
      <dl className="grid gap-3 rounded-xl border border-sand-200 bg-white p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-sand-600">{t("email")}</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("phone")}</dt>
          <dd className="font-medium">{user.phoneNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("status")}</dt>
          <dd>
            <Badge tone={user.status === "ACTIVE" ? "good" : "danger"}>
              {enumLabel(te, "userStatus", user.status)}
            </Badge>

            {user.suspensionReason ? (
              <span className="ml-2 text-sand-700">{user.suspensionReason}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-sand-600">{t("mfa")}</dt>
          <dd className="font-medium">{user.twoFactorEnabled ? "✓" : "—"}</dd>
        </div>
      </dl>
      <UserAdminForms
        userId={user.id}
        isSelf={user.id === actor.id}
        status={user.status}
        roles={roles}
        assignedRoleIds={user.userRoles.map((r) => r.roleId)}
        canManageRoles={access.permissions.has("user.manage_roles")}
        canSuspend={access.permissions.has("user.suspend")}
      />
    </div>
  );
}
