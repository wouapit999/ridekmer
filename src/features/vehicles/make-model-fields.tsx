"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ChangeEvent } from "react";

import { Field, Input, Select } from "@/components/ui/field";

import { findCatalogMake, findCatalogModel, OTHER_OPTION, VEHICLE_CATALOG } from "./catalog";

interface PreviewImage {
  url: string;
  sourcePageUrl: string;
  author: string | null;
  license: string;
}

function setFormValue(form: HTMLFormElement | null, name: string, value: string) {
  const el = form?.elements.namedItem(name);
  if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) el.value = value;
}

/**
 * Make and model as lists (with "Other" for free text). Choosing a listed model pre-fills
 * category, body type and seats, and previews the illustrative photo customers will see
 * until real photos are uploaded. The submitted `make` and `model` fields keep their names.
 */
export function MakeModelFields({
  make: initialMake,
  model: initialModel,
  errors,
}: {
  make: string;
  model: string;
  errors: { make?: string | null; model?: string | null };
}) {
  const t = useTranslations("owner.wizard.basics");
  const tp = useTranslations("cars.photo");
  const knownMake = initialMake ? findCatalogMake(initialMake) : undefined;
  const knownModel =
    initialMake && initialModel ? findCatalogModel(initialMake, initialModel) : undefined;

  const [makeChoice, setMakeChoice] = useState(
    knownMake ? knownMake.name : initialMake ? OTHER_OPTION : "",
  );
  const [makeText, setMakeText] = useState(knownMake ? "" : initialMake);
  const [modelChoice, setModelChoice] = useState(
    knownModel ? knownModel.name : initialModel ? OTHER_OPTION : "",
  );
  const [modelText, setModelText] = useState(knownModel ? "" : initialModel);
  const [lookup, setLookup] = useState<{
    key: string;
    image: PreviewImage | null;
    done: boolean;
  } | null>(null);

  const make = makeChoice === OTHER_OPTION ? makeText.trim() : makeChoice;
  const model =
    modelChoice === OTHER_OPTION || makeChoice === OTHER_OPTION ? modelText.trim() : modelChoice;
  const models =
    makeChoice && makeChoice !== OTHER_OPTION ? (findCatalogMake(makeChoice)?.models ?? []) : [];

  const lookupKey = make.length >= 2 && model.length >= 1 ? `${make}|${model}` : null;
  useEffect(() => {
    if (!lookupKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookup({ key: lookupKey, image: null, done: false });
      try {
        const res = await fetch(
          `/api/vehicles/reference-image?${new URLSearchParams({ make, model })}`,
          { signal: controller.signal },
        );
        const body = res.ok ? ((await res.json()) as { image: PreviewImage | null }) : null;
        setLookup({ key: lookupKey, image: body?.image ?? null, done: true });
      } catch {
        if (!controller.signal.aborted) setLookup({ key: lookupKey, image: null, done: true });
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [lookupKey, make, model]);
  const current = lookup && lookup.key === lookupKey ? lookup : null;
  const preview = current?.image ?? null;
  const previewState = !current ? "idle" : current.done ? (preview ? "idle" : "none") : "loading";

  function onMakeChange(e: ChangeEvent<HTMLSelectElement>) {
    setMakeChoice(e.target.value);
    setModelChoice("");
  }

  function onModelChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setModelChoice(value);
    const hint = findCatalogModel(makeChoice, value);
    if (hint) {
      setFormValue(e.target.form, "category", hint.category);
      setFormValue(e.target.form, "bodyType", hint.bodyType);
      setFormValue(e.target.form, "seats", String(hint.seats));
    }
  }

  const freeModel = makeChoice === OTHER_OPTION || modelChoice === OTHER_OPTION;

  return (
    <>
      <input type="hidden" name="make" value={make} />
      <input type="hidden" name="model" value={model} />
      <Field id="makeChoice" label={t("make")} required error={errors.make}>
        <Select id="makeChoice" value={makeChoice} onChange={onMakeChange} required>
          <option value="" disabled>
            {t("chooseMake")}
          </option>
          {VEHICLE_CATALOG.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
          <option value={OTHER_OPTION}>{t("otherMake")}</option>
        </Select>
      </Field>
      {makeChoice === OTHER_OPTION ? (
        <Field id="makeText" label={t("makeOther")} required>
          <Input
            id="makeText"
            value={makeText}
            onChange={(e) => setMakeText(e.target.value)}
            maxLength={60}
            required
          />
        </Field>
      ) : (
        <Field id="modelChoice" label={t("model")} required error={errors.model}>
          <Select
            id="modelChoice"
            value={modelChoice}
            onChange={onModelChange}
            disabled={!makeChoice}
            required
          >
            <option value="" disabled>
              {makeChoice ? t("chooseModel") : t("chooseMakeFirst")}
            </option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
            <option value={OTHER_OPTION}>{t("otherModel")}</option>
          </Select>
        </Field>
      )}
      {freeModel ? (
        <Field
          id="modelText"
          label={makeChoice === OTHER_OPTION ? t("model") : t("modelOther")}
          required
          error={makeChoice === OTHER_OPTION ? errors.model : undefined}
        >
          <Input
            id="modelText"
            value={modelText}
            onChange={(e) => setModelText(e.target.value)}
            maxLength={60}
            required
          />
        </Field>
      ) : null}
      <div className="sm:col-span-2">
        {preview ? (
          <figure className="flex items-start gap-3 rounded-md border border-sand-200 bg-sand-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote Wikimedia thumbnail */}
            <img
              src={preview.url}
              alt={tp("illustrativeAlt", { name: `${make} ${model}` })}
              className="h-20 w-32 rounded object-cover"
              referrerPolicy="no-referrer"
            />
            <figcaption className="text-xs text-sand-700">
              <span className="block font-medium text-sand-900">{tp("previewTitle")}</span>
              {tp("previewBody")}{" "}
              <a
                href={preview.sourcePageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {preview.author
                  ? tp("credit", { author: preview.author, license: preview.license })
                  : tp("creditNoAuthor", { license: preview.license })}
              </a>
            </figcaption>
          </figure>
        ) : previewState === "loading" ? (
          <p className="text-xs text-sand-600">{tp("previewLoading")}</p>
        ) : previewState === "none" ? (
          <p className="text-xs text-sand-600">{tp("previewNone")}</p>
        ) : null}
      </div>
    </>
  );
}
