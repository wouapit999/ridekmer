"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export interface StripCar {
  id: string;
  name: string;
  city: string;
  price: string;
  photo: string;
  /** A licensed photo of the model rather than of this car. */
  illustrative: boolean;
}

/**
 * Real cars from the catalogue gliding past, paused on hover or focus. The list is drawn twice
 * so the loop is seamless; the copy is hidden from assistive technology. With reduced motion
 * the strip becomes an ordinary horizontally scrollable row.
 */
export function CarStrip({ cars }: { cars: StripCar[] }) {
  const t = useTranslations("home.featured");
  if (cars.length === 0) return null;
  const card = (car: StripCar, copy: boolean) => (
    <li
      key={`${car.id}${copy ? "-copy" : ""}`}
      aria-hidden={copy || undefined}
      className="w-72 shrink-0"
    >
      <Link
        href={`/cars/${car.id}`}
        tabIndex={copy ? -1 : undefined}
        className="group block overflow-hidden rounded-xl border border-sand-200 bg-white shadow-card transition hover:-translate-y-1 hover:shadow-lg"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-sand-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- catalogue photo URL */}
          <img
            src={car.photo}
            alt={copy ? "" : car.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
          />
          {car.illustrative ? (
            <span className="absolute top-2 left-2 rounded bg-sand-900/75 px-2 py-0.5 text-xs font-medium text-white">
              {t("illustrative")}
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <p className="font-semibold text-sand-900">{car.name}</p>
          <p className="text-sm text-sand-600">{car.city}</p>
          <p className="mt-2 text-sm text-sand-800">
            {t("from")} <span className="font-bold text-brand-700">{car.price}</span> {t("perDay")}
          </p>
        </div>
      </Link>
    </li>
  );
  return (
    <div className="car-strip group/strip relative overflow-hidden motion-reduce:overflow-x-auto">
      <ul className="car-strip-track flex w-max gap-4 py-2 group-focus-within/strip:[animation-play-state:paused] group-hover/strip:[animation-play-state:paused]">
        {cars.map((car) => card(car, false))}
        {cars.map((car) => card(car, true))}
      </ul>
    </div>
  );
}
