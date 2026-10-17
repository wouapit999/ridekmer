/**
 * Labels for enum-like codes (statuses, types, roles, ledger accounts…) shown to users.
 * Pass the translator of the `enums` namespace (or any namespace holding a code map).
 * A code without a translation falls back to a readable version of the code instead of a
 * missing-message error, so a new database value never breaks a page.
 */
export interface EnumTranslator {
  (key: string): string;
  has(key: string): boolean;
}

/** `CHAUFFEUR_DRIVEN` → "Chauffeur driven", `platform_cash` → "Platform cash". */
export function humaniseCode(code: string): string {
  const words = code
    .replace(/[_\-.:]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}

export function enumLabel(
  t: EnumTranslator,
  group: string,
  code: string | null | undefined,
): string {
  if (!code) return "—";
  const key = `${group}.${code}`;
  return t.has(key) ? t(key) : humaniseCode(code);
}

/** Ledger account keys may carry a suffix (`owner_payable:<ownerProfileId>`). */
export function ledgerAccountLabel(t: EnumTranslator, key: string): string {
  const base = key.split(":")[0] ?? key;
  return enumLabel(t, "ledgerAccount", base);
}
