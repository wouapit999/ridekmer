import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/cn";
import type { ReferenceImage } from "@/server/vehicles/reference-image";

/**
 * One picture slot for a vehicle: the owner's own photo when there is one, otherwise a freely
 * licensed photo of the same make and model clearly marked as illustrative, otherwise a drawn silhouette. Customers are never shown a stock photo
 * as if it were the actual car.
 */
export async function VehiclePhoto({
  photoUrl,
  reference,
  alt,
  className,
  eager = false,
}: {
  photoUrl?: string | null;
  reference?: ReferenceImage | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const t = await getTranslations("cars.photo");
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
      <img
        src={photoUrl}
        alt={alt}
        className={cn("h-full w-full object-cover", className)}
        loading={eager ? "eager" : "lazy"}
      />
    );
  }
  if (reference) {
    return (
      <div className={cn("relative h-full w-full", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote Wikimedia thumbnail, already sized */}
        <img
          src={reference.url}
          alt={t("illustrativeAlt", { name: alt })}
          width={reference.width ?? undefined}
          height={reference.height ?? undefined}
          className="h-full w-full object-cover"
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
        />
        <span className="absolute top-2 left-2 rounded bg-sand-900/75 px-2 py-0.5 text-xs font-medium text-white">
          {t("illustrative")}
        </span>
      </div>
    );
  }
  return (
    <span
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-sand-100 text-sand-500",
        className,
      )}
    >
      <svg
        viewBox="0 0 120 48"
        aria-hidden="true"
        className="w-2/5 max-w-40 fill-current opacity-60"
      >
        <path d="M14 34c-4 0-6-2-6-5v-5c0-2 1-3 3-4l14-4 12-9c2-1 4-2 7-2h30c3 0 5 1 7 3l11 10 12 3c3 1 5 3 5 6v2c0 3-2 5-5 5h-4a11 11 0 0 0-22 0H40a11 11 0 0 0-22 0Zm29-24-9 7h28V9H47c-2 0-3 0-4 1Zm24-1v8h26l-8-7c-1-1-2-1-3-1Z" />
        <circle cx="29" cy="37" r="8" />
        <circle cx="91" cy="37" r="8" />
      </svg>
      <span className="text-sm">{t("none")}</span>
    </span>
  );
}

/** Licence credit and "may differ" note shown under an illustrative photo. */
export async function VehicleCredit({ reference }: { reference: ReferenceImage }) {
  const t = await getTranslations("cars.photo");
  return (
    <p className="mt-1 text-xs text-sand-600">
      {t("illustrativeNote")}{" "}
      <a
        href={reference.sourcePageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-brand-700"
      >
        {reference.author
          ? t("credit", { author: reference.author, license: reference.license })
          : t("creditNoAuthor", { license: reference.license })}
      </a>
      {reference.licenseUrl ? (
        <>
          {" "}
          <a
            href={reference.licenseUrl}
            target="_blank"
            rel="noopener noreferrer license"
            className="underline hover:text-brand-700"
          >
            {t("licence")}
          </a>
        </>
      ) : null}
    </p>
  );
}
