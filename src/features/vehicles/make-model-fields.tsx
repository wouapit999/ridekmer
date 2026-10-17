"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";

import { Field, Input, Select } from "@/components/ui/field";

import { findCatalogMake, findCatalogModel, OTHER_OPTION, VEHICLE_CATALOG } from "./catalog";

function setFormValue(form: HTMLFormElement | null, name: string, value: string) {
  const el = form?.elements.namedItem(name);
  if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) el.value = value;
}

/**
 * Make and model as lists (with "Other" for free text). Choosing a listed model pre-fills
 * category, body type and seats; the parent shows the matching photo (it also knows the
 * year). The submitted `make` and `model` fields keep their names.
 */
export function MakeModelFields({
  make: initialMake,
  model: initialModel,
  errors,
  onChange,
  inlinePreview,
}: {
  make: string;
  model: string;
  errors: { make?: string | null; model?: string | null };
  onChange?: (make: string, model: string) => void;
  /** Rendered under the fields on narrow screens. */
  inlinePreview?: ReactNode;
}) {
  const t = useTranslations("owner.wizard.basics");
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

  const make = makeChoice === OTHER_OPTION ? makeText.trim() : makeChoice;
  const model =
    modelChoice === OTHER_OPTION || makeChoice === OTHER_OPTION ? modelText.trim() : modelChoice;
  const models =
    makeChoice && makeChoice !== OTHER_OPTION ? (findCatalogMake(makeChoice)?.models ?? []) : [];

  useEffect(() => {
    onChange?.(make, model);
  }, [make, model, onChange]);

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
      {inlinePreview ? <div className="sm:col-span-2 lg:hidden">{inlinePreview}</div> : null}
    </>
  );
}
