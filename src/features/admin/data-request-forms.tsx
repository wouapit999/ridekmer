"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

import { anonymiseNowAction, rejectDataRequestAction } from "./data-request-actions";

export function DataRequestActions({ requestId, type }: { requestId: string; type: string }) {
  const t = useTranslations("admin.dataRequests");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-2">
      {message ? <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        {type === "DELETION" ? (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await anonymiseNowAction(requestId);
                setMessage(
                  result.ok
                    ? { ok: true, text: t("done") }
                    : { ok: false, text: t("blocked", { code: result.code ?? "ERROR" }) },
                );
              })
            }
          >
            {t("anonymiseNow")}
          </Button>
        ) : null}
        <label className="sr-only" htmlFor={`reject-${requestId}`}>
          {t("rejectReason")}
        </label>
        <Input
          id={`reject-${requestId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("rejectReason")}
          className="max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            start(async () => {
              const result = await rejectDataRequestAction(requestId, reason.trim());
              setMessage(
                result.ok
                  ? { ok: true, text: t("done") }
                  : { ok: false, text: t("blocked", { code: result.code ?? "ERROR" }) },
              );
            })
          }
        >
          {t("reject")}
        </Button>
      </div>
    </div>
  );
}
