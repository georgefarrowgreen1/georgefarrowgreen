// The exchange's quote clock, separate from when this device fetched it.
export function quoteSession(q, priceSaid, pct, now = Date.now()) {
  if (!q) return "";
  const stamp = (t) => t ? new Date(t * 1000).toLocaleString("en-GB", { timeZone: q.tz || "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "Time unavailable";
  const always = q.kind === "crypto" || q.kind === "currency" || ["CRYPTOCURRENCY", "CURRENCY"].includes(q.type);
  const open = always || (q.open && now / 1000 >= q.open.start && now / 1000 < q.open.end);
  const label = open ? "Open · Quote" : q.open ? "Closed · Last regular-session price" : "Last quoted price";
  const lines = [`${label} · ${stamp(q.time)}${q.stale ? " · Prices delayed" : ""}`];
  const x = q.extended;
  if (!open && x?.price != null && x.time > q.time && ["pre", "post"].includes(x.session)) {
    lines.push(`${x.session === "pre" ? "Pre-market" : "After-hours"} · ${priceSaid(q, x.price)}${x.chgPct != null ? ` (${pct(x.chgPct)} vs close)` : ""} · ${stamp(x.time)}`);
  }
  return lines.join("\n");
}
