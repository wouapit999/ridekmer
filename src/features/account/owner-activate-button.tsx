"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

import { activateOwnerSpace } from "./actions";

export function OwnerActivateButton() {
  const t = useTranslations("account.overview");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          await activateOwnerSpace();
          router.push("/owner");
          router.refresh();
        })
      }
    >
      {t("becomeOwner")}
    </Button>
  );
}
