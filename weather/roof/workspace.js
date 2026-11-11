// Optional OS workspace bridge. Loaded only when fw.workspace.enabled is true;
// the ordinary Today graph and the forecast/radar clocks do not depend on it.
import { HOUR, DAY, keyOf, nowWall } from "../format.js";
import { cell } from "../data.js";
import { phrase, rainChance, hoursBetween, hourAt } from "../insights.js";
import { label } from "../codes.js";
import { h } from "./wxui.js";

const clean = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, max) : "";
export const placeOf = (v) => v && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90 && Number.isFinite(v.lon) && Math.abs(v.lon) <= 180 && clean(v.name, 120)
  ? { name: clean(v.name, 120), lat: v.lat, lon: v.lon, ...(clean(v.region, 80) ? { region: clean(v.region, 80) } : {}) } : null;
export const intervalOf = (v) => v && Number.isSafeInteger(v.start) && Number.isSafeInteger(v.end) && v.end > v.start && v.end - v.start <= 48 * HOUR ? { start: v.start, end: v.end } : null;
const read = (v) => ({ location: placeOf(v?.location), interval: intervalOf(v?.interval) });
const samePlace = (a, b) => !!a && !!b && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6 && a.name === b.name;

// Project the existing hourly forecast onto an absolute UTC ride interval. The
// existing forecast's wall-clock axis/area key and probability helpers are used
// unchanged. Missing location, stale-area data and incomplete coverage are explicit.
export function periodFor(wx, selection) {
  const interval = intervalOf(selection?.interval), selectedPlace = placeOf(selection?.location);
  if (!interval) return null;
  const base = { ...interval, hours: [], summary: null, rainChance: null };
  if (!selectedPlace) return { ...base, state: "location-needed" };
  if (!wx) return { ...base, state: "loading" };
  if (cell(selectedPlace.lat, selectedPlace.lon) !== cell(wx.place.lat, wx.place.lon)) return { ...base, state: "location-mismatch" };
  const from = nowWall(wx.place.offset, interval.start), to = nowWall(wx.place.offset, interval.end), all = wx.hourly || [];
  const hours = hoursBetween(wx, Math.floor(from / HOUR) * HOUR, to);
  if (!all.length || from < all[0].t || to > all.at(-1).t + HOUR || !hours.length) return { ...base, state: "outside-forecast", from, to };
  return { ...interval, from, to, state: "ready", summary: phrase(hours) || label(hours[0].code), rainChance: rainChance(wx, from, to),
    hours: hours.map((v) => ({ at: v.t - (wx.place.offset || 0) * 1000, temp: v.temp, code: v.code, wind: v.wind, gust: v.gust, pop: v.pop, precip: v.precip })) };
}

export function connect(ctx, root) {
  const sdk = ctx.fw.workspace, core = ctx.core, S = ctx.S;
  let alive = true, active = false, selection = read(sdk.context.get()), published = "";
  root.setAttribute("data-workspace", "");
  const title = h("b", {}, "Ride forecast"), detail = h("p"), info = h("p", { class: "wx-note" });
  const viewDay = h("button", { class: "ifl-btn ifl-btn-sm", type: "button", onclick: () => run("window") }, "View day");
  const banner = h("aside", { class: "wx-workspace-context", "aria-label": "Ride forecast", hidden: true }, h("div", {}, title, detail, info), viewDay);
  root.prepend(banner);

  function snapshot() {
    const wx = S.wx, c = wx && (wx.current || hourAt(wx, nowWall(wx.place.offset))), window = periodFor(wx, selection);
    return { app: "weather", ready: !!wx, loading: !!S.loading, stale: !!S.stale, error: S.error || null, place: placeOf(core.place()), interval: selection.interval,
      forecast: c ? { temperature: S.f.temp(c.temp), condition: label(c.code), fetchedAt: wx.fetchedAt || S.updatedAt || null } : null, window,
      actions: [{ id: "places", label: "Choose location" }, { id: "use-place", label: "Use this location" }, { id: "window", label: "View selected day" }, { id: "refresh", label: "Refresh" }] };
  }
  function changed() {
    if (!alive) return;
    const next = JSON.stringify(snapshot());
    if (next !== published) { published = next; sdk.changed(); }
  }
  function paint() {
    if (!alive || !active) return;
    const period = periodFor(S.wx, selection), matches = period?.state === "ready", radar = root.querySelector('.wx-sec[data-sec="radar"]:not([hidden])');
    banner.hidden = !!radar || (!selection.location && !selection.interval);
    const f = S.f, wx = S.wx;
    const knownArea = wx && selection.location && cell(selection.location.lat, selection.location.lon) === cell(wx.place.lat, wx.place.lon);
    const when = knownArea && selection.interval ? `${f.dateLong(nowWall(wx.place.offset, selection.interval.start))} · ${f.time(nowWall(wx.place.offset, selection.interval.start))}–${f.time(nowWall(wx.place.offset, selection.interval.end))}` : "Selected ride window";
    detail.textContent = [selection.location?.name, selection.interval ? when : null].filter(Boolean).join(" · ");
    info.textContent = !selection.interval ? "Set a ride time to compare the forecast." : period.state === "location-needed" ? "Choose a ride location to compare the forecast." : matches ? period.summary
      : period.state === "outside-forecast" ? "That time is outside the available forecast." : S.error && !S.loading ? "The forecast isn’t available right now." : "Loading the forecast for this location…";
    const day = knownArea && selection.interval ? keyOf(nowWall(wx.place.offset, selection.interval.start)) : null;
    viewDay.hidden = !day || !wx.daily?.some((d) => d.key === day);
    for (const node of root.querySelectorAll(".hour[data-hour],.wx-day[data-day]")) {
      const at = node.dataset.hour != null ? Number(node.dataset.hour) : Date.parse(node.dataset.day + "T00:00:00Z"), width = node.dataset.hour != null ? HOUR : DAY;
      const selected = !!matches && at < period.to && at + width > period.from, was = node.hasAttribute("data-workspace-selected");
      node.toggleAttribute("data-workspace-selected", selected);
      if (selected) node.setAttribute("aria-description", "Selected ride window"); else if (was) node.removeAttribute("aria-description");
    }
  }
  function apply() {
    if (!alive || !active || !ctx.fw.visible()) return;
    const selectedPlace = selection.location;
    if (selectedPlace && !samePlace(selectedPlace, core.place())) core.look(selectedPlace);
    paint(); changed();
  }
  // Invoked only by explicit Weather UI actions. Initial place, automatic GPS,
  // refreshes and forecast events never publish location to a ride implicitly.
  function placeSelected(value) {
    const selectedPlace = placeOf(value);
    if (!alive || !active || !ctx.fw.visible() || !selectedPlace) return false;
    if (!samePlace(selectedPlace, placeOf(sdk.context.get()?.location))) sdk.context.update({ location: selectedPlace }, { source: "weather:place" });
    selection = read(sdk.context.get()); paint(); changed();
    return true;
  }
  function run(intent, arg) {
    if (!alive || !active || !ctx.fw.visible()) return false;
    if (intent === "refresh") { core.refresh(); return true; }
    if (intent === "places") return ctx.open.places();
    if (intent === "use-place") return placeSelected(core.place());
    const key = intent === "day" ? arg : selection.interval && S.wx ? keyOf(nowWall(S.wx.place.offset, selection.interval.start)) : null;
    if ((intent === "window" || intent === "day") && S.wx?.daily?.some((d) => d.key === key)) return ctx.open.day(key);
    return false;
  }
  const offs = [sdk.provide({ snapshot, run }), sdk.context.subscribe((value, meta) => {
    selection = read(value);
    if (!String(meta?.source || "").startsWith("weather")) apply(); else { paint(); changed(); }
  }), ...["wx", "place", "settings", "loading", "error"].map((event) => core.on(event, () => { paint(); changed(); }))];
  function destroy() {
    if (!alive) return;
    alive = false; active = false;
    for (const off of offs) off?.();
    ctx.fw.signal?.removeEventListener("abort", destroy);
    banner.remove(); root.removeAttribute("data-workspace");
  }
  ctx.fw.signal?.addEventListener("abort", destroy, { once: true });
  return { paint, placeSelected, show() { if (!alive) return; active = true; selection = read(sdk.context.get()); apply(); }, hide() { active = false; }, destroy };
}
