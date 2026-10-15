/** Tiny class-name joiner (no dependency). Accepts strings, falsy values and arrays. */
export function cn(
  ...parts: Array<string | false | null | undefined | Array<string | false | null | undefined>>
): string {
  return parts
    .flat()
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(" ");
}
