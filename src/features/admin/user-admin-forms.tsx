"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";

import { saveUserRoles, setUserStatus, type AdminActionResult } from "./actions";

interface Props {
  userId: string;
  isSelf: boolean;
  status: string;
  roles: Array<{ id: string; key: string; name: string; isStaff: boolean; requiresMfa: boolean }>;
  assignedRoleIds: string[];
  canManageRoles: boolean;
  canSuspend: boolean;
}

export function UserAdminForms({
  userId,
  isSelf,
  status,
  roles,
  assignedRoleIds,
  canManageRoles,
  canSuspend,
}: Props) {
  const t = useTranslations("admin.users");
  const [rolesState, rolesAction, rolesPending] = useActionState(saveUserRoles, {
    ok: false,
  } as AdminActionResult);
  const [statusState, statusAction, statusPending] = useActionState(setUserStatus, {
    ok: false,
  } as AdminActionResult);

  if (isSelf) return <Alert tone="warning">{t("cannotEditSelf")}</Alert>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canManageRoles ? (
        <form
          action={rolesAction}
          className="space-y-4 rounded-xl border border-sand-200 bg-white p-5"
        >
          <h2 className="text-lg font-semibold">{t("assignRoles")}</h2>
          {rolesState.ok ? <Alert tone="success">{t("rolesSaved")}</Alert> : null}
          <input type="hidden" name="userId" value={userId} />
          <ul className="space-y-2">
            {roles.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="roleIds"
                    value={r.id}
                    defaultChecked={assignedRoleIds.includes(r.id)}
                  />
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-sand-500">
                    {r.key}
                    {r.requiresMfa ? " · MFA" : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button type="submit" loading={rolesPending}>
            {t("saveRoles")}
          </Button>
        </form>
      ) : null}
      {canSuspend ? (
        <form
          action={statusAction}
          className="space-y-4 rounded-xl border border-sand-200 bg-white p-5"
        >
          <h2 className="text-lg font-semibold">
            {status === "ACTIVE" ? t("suspend") : t("reinstate")}
          </h2>
          {statusState.ok ? (
            <Alert tone="success">
              {statusState.message === "suspended" ? t("suspended") : t("reinstated")}
            </Alert>
          ) : null}
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value={status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
          <Field id="reason" label={t("suspendReason")} required>
            <Input id="reason" name="reason" required minLength={3} maxLength={500} />
          </Field>
          <Button
            type="submit"
            variant={status === "ACTIVE" ? "danger" : "primary"}
            loading={statusPending}
          >
            {status === "ACTIVE" ? t("suspend") : t("reinstate")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
