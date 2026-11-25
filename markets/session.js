// The exchange's quote clock, separate from when this device fetched it.
const minute = 60_000;
const hasTime = time => Number.isFinite(time) && time > 0 && time < 8.64e12;

export function quoteStamp(time, zone = "UTC") {
  if (!hasTime(time)) return "Time unavailable";
  const date = new Date(time * 1000);
  const parts = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  try { return date.toLocaleString("en-GB", { ...parts, timeZone: zone || "UTC" }); }
  catch { return date.toLocaleString("en-GB", { ...parts, timeZone: "UTC" }); }
}

export function fromSavedQuotes(quotes) {
  return Object.fromEntries(Object.entries(quotes || {}).map(([symbol, quote]) => [symbol, quote && { ...quote, saved: true }]));
}

export function quoteFreshness(q, now = Date.now()) {
  if (!q) return { short: "Quote unavailable" };
  const always = q.kind === "crypto" || q.kind === "currency" || ["CRYPTOCURRENCY", "CURRENCY"].includes(q.type);
  const session = q.open && Number.isFinite(q.open.start) && q.open.end > q.open.start;
  const open = always || (session && now / 1000 >= q.open.start && now / 1000 < q.open.end);
  const age = hasTime(q.time) ? now - q.time * 1000 : Infinity;
  if (q.saved) return { short: "Saved", label: "Saved quote", open };
  if (q.stale || (open && age > 15 * minute && Number.isFinite(age))) return { short: "Delayed", label: "Prices delayed", open };
  const streamAge = now - q.live?.at;
  if (open && age >= -10_000 && age < 1.5 * minute && streamAge >= 0 && streamAge < 1.5 * minute) {
    return { short: "Live", label: "Live quote · Yahoo Finance", open };
  }
  if (open) return { short: "Quote", label: "Open · Quote", open };
  if (session) return { short: "Closed", label: "Closed · Last regular-session price", open };
  return { short: "Last quote", label: "Last quoted price", open };
}

export function quoteSession(q, priceSaid, pct, now = Date.now()) {
  if (!q) return "";
  const { open, label } = quoteFreshness(q, now);
  const lines = [`${label} · ${quoteStamp(q.time, q.tz)}`];
  const x = q.extended;
  if (!open && x?.price != null && x.time > q.time && ["pre", "post"].includes(x.session)) {
    lines.push(`${x.session === "pre" ? "Pre-market" : "After-hours"} · ${priceSaid(q, x.price)}${x.chgPct != null ? ` (${pct(x.chgPct)} vs close)` : ""} · ${quoteStamp(x.time, q.tz)}`);
  }
  return lines.join("\n");
}
