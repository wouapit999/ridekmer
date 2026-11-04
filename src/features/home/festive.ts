/**
 * Festive season (Christmas and New Year): the site dresses up from 1 November to 15 January,
 * Douala time. NEXT_PUBLIC_FESTIVE_THEME forces it: "on", "off", or "auto" (the default).
 */
export type FestiveMode = "auto" | "on" | "off";

export function festiveMode(raw: string | undefined = process.env.NEXT_PUBLIC_FESTIVE_THEME) {
  return raw === "on" || raw === "off" ? raw : "auto";
}

export function isFestiveSeason(now: Date, mode: FestiveMode = festiveMode()): boolean {
  if (mode !== "auto") return mode === "on";
  // Douala is UTC+1 all year round.
  const douala = new Date(now.getTime() + 60 * 60 * 1000);
  const month = douala.getUTCMonth() + 1;
  const day = douala.getUTCDate();
  return month === 11 || month === 12 || (month === 1 && day <= 15);
}

/** The year whose holidays are being celebrated (a January visit still belongs to December's). */
export function festiveYear(now: Date): number {
  const douala = new Date(now.getTime() + 60 * 60 * 1000);
  return douala.getUTCMonth() === 0 ? douala.getUTCFullYear() - 1 : douala.getUTCFullYear();
}

/**
 * Inline script run before the first paint: marks <html data-festive> in season (and
 * data-festive-ribbon-off once the ribbon was closed this season) and writes the holiday years.
 * CSS shows the decorations from these attributes, so nothing shifts once the page loads, even
 * on pages rendered weeks earlier. Mirrors isFestiveSeason and festiveYear.
 */
export function festiveBootScript(mode: FestiveMode = festiveMode()): string {
  return `(function(){try{var d=new Date(Date.now()+36e5),m=d.getUTCMonth()+1,day=d.getUTCDate(),mode=${JSON.stringify(mode)};
var on=mode==="on"||(mode==="auto"&&(m===11||m===12||(m===1&&day<=15)));if(!on)return;
var y=m===1?d.getUTCFullYear()-1:d.getUTCFullYear(),h=document.documentElement;h.setAttribute("data-festive","");
try{if(localStorage.getItem("${RIBBON_KEY_PREFIX}"+y)==="1")h.setAttribute("data-festive-ribbon-off","")}catch(e){}
h.setAttribute("data-festive-year",String(y));}catch(e){}})();`;
}

export const RIBBON_KEY_PREFIX = "ridekmer:festive-ribbon:";
