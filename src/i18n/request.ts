import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Africa/Douala",
    formats: {
      number: {
        xaf: {
          style: "currency",
          currency: "XAF",
          currencyDisplay: "code",
          maximumFractionDigits: 0,
        },
      },
      dateTime: {
        short: { dateStyle: "medium" },
        full: { dateStyle: "medium", timeStyle: "short" },
      },
    },
  };
});
