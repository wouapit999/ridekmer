import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function SearchForm({
  cities,
  defaults = {},
}: {
  cities: Array<{ slug: string; name: string }>;
  defaults?: Record<string, string | undefined>;
}) {
  const t = useTranslations("home.search");
  return (
    <form
      action="/cars"
      method="get"
      className="rounded-xl border border-sand-200 bg-white p-5 shadow-card"
      aria-labelledby="search-title"
    >
      <h2 id="search-title" className="text-lg font-semibold text-sand-900">
        {t("title")}
      </h2>
      <div className="mt-4 grid gap-4">
        <Field id="city" label={t("city")}>
          <Select id="city" name="city" defaultValue={defaults.city ?? ""}>
            <option value="">{t("anyCity")}</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="pickupDate" label={t("pickupDate")}>
            <Input
              id="pickupDate"
              name="pickupDate"
              type="date"
              defaultValue={defaults.pickupDate}
            />
          </Field>
          <Field id="pickupTime" label={t("pickupTime")}>
            <Input
              id="pickupTime"
              name="pickupTime"
              type="time"
              defaultValue={defaults.pickupTime ?? "09:00"}
            />
          </Field>
          <Field id="returnDate" label={t("returnDate")}>
            <Input
              id="returnDate"
              name="returnDate"
              type="date"
              defaultValue={defaults.returnDate}
            />
          </Field>
          <Field id="returnTime" label={t("returnTime")}>
            <Input
              id="returnTime"
              name="returnTime"
              type="time"
              defaultValue={defaults.returnTime ?? "09:00"}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-sand-800">{t("driveType")}</legend>
          <div className="mt-2 flex gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="drive"
                value="self"
                defaultChecked={(defaults.drive ?? "self") === "self"}
                className="h-4 w-4"
              />
              {t("selfDrive")}
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="drive"
                value="chauffeur"
                defaultChecked={defaults.drive === "chauffeur"}
                className="h-4 w-4"
              />
              {t("chauffeur")}
            </label>
          </div>
        </fieldset>
        <Button type="submit" size="lg">
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
