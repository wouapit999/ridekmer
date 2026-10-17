"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";

import {
  addSampleCarsAction,
  removeSampleCarsAction,
  type SampleCarsResult,
} from "./sample-cars-actions";

const initial: SampleCarsResult = { ok: false };

function Result({ state }: { state: SampleCarsResult }) {
  const t = useTranslations("admin.samples");
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "danger"}>
      {t(`result.${state.message}`, { count: state.count ?? 0 })}
    </Alert>
  );
}

export function SampleCarsControls({ count }: { count: number }) {
  const t = useTranslations("admin.samples");
  const [addState, add, adding] = useActionState(async () => addSampleCarsAction(), initial);
  const [removeState, remove, removing] = useActionState(removeSampleCarsAction, initial);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        action={add}
        className="space-y-3 rounded-lg border border-sand-200 bg-white p-5 shadow-card"
      >
        <h2 className="text-lg font-semibold text-sand-900">{t("addTitle")}</h2>
        <p className="text-sm text-sand-700">{t("addBody")}</p>
        <Result state={addState} />
        <Button type="submit" loading={adding}>
          {t("addButton")}
        </Button>
      </form>
      <form
        action={remove}
        className="space-y-3 rounded-lg border border-sand-200 bg-white p-5 shadow-card"
      >
        <h2 className="text-lg font-semibold text-sand-900">{t("removeTitle")}</h2>
        <p className="text-sm text-sand-700">{t("removeBody", { count })}</p>
        <label className="flex items-start gap-2 text-sm text-sand-800">
          <Checkbox name="confirm" />
          <span>{t("removeConfirm")}</span>
        </label>
        <Result state={removeState} />
        <Button type="submit" variant="danger" loading={removing} disabled={count === 0}>
          {t("removeButton")}
        </Button>
      </form>
    </div>
  );
}
