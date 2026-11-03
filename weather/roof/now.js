// Weather's Now section (One roof, spec §7.1, WV): the hero (.wx-hero, Today's .tcard.wx markup, hint.sky until its own
// forecast), its status line, the warnings slot (.wx-alerts), the cards in S.settings.layout order (not daily, not
// radar), the "ask" card, the foot with the credits line (.wx-credits).
// Frozen: view(el, ctx) → { draw(), hide(), destroy() } (every section view's signature):
//   el: the section.wx-sec[data-sec=now] weather.js made; ctx = { S, core, fw, open, hint } (see weather.js).
//   draw(): (re)draw from ctx.S; called when the section shows and on core events while it shows; cheap when nothing
//   changed. hide(): its section or screen left (pause timers, observers). destroy(): unmount (remove what it added).
// Hooks (frozen, .tools/tests/roofhooks.mjs; inside this section): the hero's Send, fw.sendButton()'s button
//   ([data-act=send], FW) placed in .wx-hero; the hero's Retry .wx-hero [data-act=retry] while the forecast failed
//   (S.error; → core.refresh()); the foot's Refresh [data-act=refresh]; Next 48 hours' metric ui.seg wrapped in (or
//   being) [data-key=metric], values "temp" | "rain" | "wind"; each Right now tile's tappable element [data-detail=<kind>]
//   (weather/detail.js's kinds: feels, wind, humidity, rain, pressure, visibility, uv, air, sun, moon, sea) → open.detail(kind).
import { makeFormat, keyOf, HOUR, nowWall } from "../format.js";
import * as I from "../insights.js";
import { codeInfo, iconOf, label, LIGHT_MMH, HEAVY_MMH, heaviness } from "../codes.js";
import { weatherIcon, glyph } from "../icons.js";
import { timeChart, rangeChart } from "../charts.js";
import { climateOn, rankIn, yearsAgo } from "../climate.js";
import { inForce, colourOf, titleOf, glyphOf } from "../official.js";
import { zonesSay, zonesSpell, zoneSaid, ZONE_COLOURS } from "../solar.js";
import { weatherSendCard, packCard } from "../send.js";
import { fetchSolar, store, cell } from "../data.js";
import { MIN_DAYS, TUNE_DAYS } from "../skill.js";
import { skyClass, skyOk, isNight, openDetail, openCredits, h, setVar, icon, glyphEl, wxCard, strip, chartHost, hourChart, tilesEl, COLOR, TILES } from "./wxui.js";
import { listFor, slotOf } from "./warnings.js";

// the cards Now draws, by layout id (app.js CARDS less "daily" and "radar", which are sections here)
export const NOW_CARDS = ["nowcast", "solar", "hourly", "right-now", "insights-card", "windows", "accuracy", "climate"];
const DEFAULT_ORDER = ["nowcast", "solar", "hourly", "right-now", "daily", "radar", "insights-card", "windows", "accuracy", "climate"];
// the cards in your order, those you've switched off left off, daily and radar skipped
export function nowOrder(layout) {
  const order = Array.isArray(layout?.order) && layout.order.length ? layout.order : DEFAULT_ORDER, off = new Set(Array.isArray(layout?.off) ? layout.off : []);
  const out = order.filter((k) => NOW_CARDS.includes(k) && !off.has(k));
  for (const k of NOW_CARDS) if (!order.includes(k) && !off.has(k)) out.push(k);
  return out;
}
// "Updated 3 min ago"
export function agoOf(at, real = Date.now()) {
  const mins = Math.round((real - at) / 60e3);
  return mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.floor(mins / 60)} h ago` : `${Math.floor(mins / 1440) === 1 ? "1 day" : `${Math.floor(mins / 1440)} days`} ago`;
}
// the place's own clock now
const clockAt = (now, f) => f.time(now);
// the view the weather calls for until one's chosen (app.js viewFor): rain if it's raining or due within the hour, wind if
// it's blowing a gale, else temperature
export function viewFor(wx, now, f) {
  const nc = I.nowcast(wx, now, f), c = wx.current || I.hourAt(wx, now) || {};
  return nc && (nc.now || nc.startsAt - now <= HOUR) ? "rain" : (c.gust ?? 0) >= 62 ? "wind" : "temp";
}
// the briefing's first sentence, and the rest
export const splitBrief = (said) => { const m = /^(.+?[.!?])\s+(?=[A-Z])(.*)$/s.exec(said); return m ? [m[1], m[2]] : [said, ""]; };

export function view(el, ctx) {
  const fw = ctx.fw, ui = fw.ui;
  let mode = null, chosen = false, bigSig = null, heroSig = null, zoomedFor = undefined, alive = true, allIns = false, allWins = false;
  const hero = h("article", { class: "tcard glass wx wx-hero", "aria-label": "Weather now" });
  const alerts = h("section", { class: "wx-alerts", "aria-label": "Warnings" });
  const cards = h("div", { class: "wx-cards" });
  const updated = h("span", { class: "wx-updated" });
  const refresh = h("button", { class: "wx-link", type: "button", data: { act: "refresh" }, onclick: () => ctx.core.refresh() }, "Refresh");
  const foot = h("footer", { class: "wx-foot" },
    h("p", { class: "wx-foot-refresh" }, updated, " · ", refresh),
    h("p", { class: "wx-credits" }, "Learn more about ",
      h("button", { class: "wx-link", type: "button", "aria-haspopup": "dialog", data: { credits: "weather" }, onclick: () => ctx.open.credits("weather") }, "weather data"), " and ",
      h("button", { class: "wx-link", type: "button", "aria-haspopup": "dialog", data: { credits: "map" }, onclick: () => ctx.open.credits("map") }, "map data"), "."));
  const wrap = h("div", { class: "wx-now-wrap" }, hero, alerts, cards, foot);
  const place = () => ctx.core.place?.() || ctx.S.places?.[ctx.S.cur] || null;
  const placeName = () => { const p = place(); return p?.gps ? "My Location" : p?.name || ctx.S.wx?.place?.name || ctx.hint?.place || ""; };

  // ---- the hero, Today's card's markup: the sky, the place and its clock, the temperature, the words, Send ----
  function drawHero(wx, now, f) {
    const S = ctx.S, hint = ctx.hint;
    const sky = wx ? skyClass(wx, now).slice(6) : skyOk(hint?.sky) ? hint.sky : "cloudy-day";
    const c = wx ? wx.current || I.hourAt(wx, now) : null, d = wx ? I.dayOf(wx, now) : null;
    const said = wx && c ? I.headline(wx, now, f) : "";
    const status = !wx ? "" : S.loading ? "Updating…" : S.error ? String(S.error) : S.stale ? `Offline · from ${f.time(nowWall(wx.place.offset, wx.fetchedAt || S.updatedAt || Date.now()))}` : "";
    const sig = JSON.stringify([sky, placeName(), c ? [f.temp(c.temp), c.code, c.isDay, f.temp(c.feels)] : hint?.temp ?? null, d ? [f.temp(d.tmax), f.temp(d.tmin)] : null, said, status, !!S.error, !!S.loading, !!wx, Math.floor(now / 60e3)]);
    if (sig === heroSig) return;
    heroSig = sig;
    hero.className = `tcard glass wx wx-hero wx-sk-${sky}${isNight(sky) || sky === "storm" ? " night" : ""}`;
    const meta = h("div", { class: "tc-head" }, h("span", { class: "tc-app" }, placeName() || "Weather"), wx ? h("span", { class: "tc-meta" }, `· ${clockAt(now, f)}`) : null);
    const kids = [meta];
    if (c) {
      kids.push(h("div", { class: "wx-now" }, h("span", { class: "t num" }, f.temp(c.temp)), h("span", { class: "wi", svg: weatherIcon(iconOf(c.code, c.isDay), 58) }),
        h("span", { class: "d" }, h("b", {}, label(c.code, c.isDay)), h("small", {}, d ? h("span", { class: "nw" }, `H ${f.temp(d.tmax)} L ${f.temp(d.tmin)}`) : null, " ", h("span", { class: "nw" }, `${d ? "· " : ""}Feels like ${f.temp(c.feels)}`)))));
      const [lead, rest] = splitBrief(said);
      kids.push(h("p", { class: "wx-brief" }, h("b", {}, lead), rest ? ` ${rest}` : ""));
    } else {
      const busy = S.error && /busy/i.test(String(S.error));
      kids.push(h("div", { class: "wx-now" }, h("span", { class: "t num" }, hint?.temp != null && !S.error ? String(hint.temp) : "–"),
        h("span", { class: "d" }, h("b", {}, S.error ? (busy ? "The forecast service is busy" : "Couldn’t get the forecast") : "Loading the forecast…"),
          S.error ? h("small", {}, busy ? "Try again in a few minutes." : "You may be offline, or the forecast service didn’t answer.") : null)));
    }
    if (status) kids.push(h("p", { class: `wx-status${S.error || S.stale ? " warn" : ""}`, role: "status" }, status));
    const acts = h("div", { class: "tc-foot" });
    if (S.error) acts.append(ui.btn("Try Again", { small: true, act: "retry", run: () => ctx.core.refresh() }));
    if (wx && c) {
      const card = weatherSendCard(wx, now, f, { activities: S.settings?.activities, name: placeName() || wx.place.name, headline: said });
      const words = card?.say || said;
      const b = fw.sendButton({ words, packed: packCard(card), what: "the weather" });
      if (b) { if (!b.dataset.act) b.dataset.act = "send"; acts.append(b); }
    }
    if (acts.childNodes.length) kids.push(acts);
    hero.replaceChildren(...kids);
    hero.setAttribute("aria-busy", String(!wx && !S.error));
  }

  // ---- the warnings slot, straight under the hero: one card for one, a banner for more; a tap opens Warnings ----
  function drawAlerts(wx, now) {
    const list = wx ? listFor(ctx, now) : [], s = slotOf(list);
    if (!s.n) { alerts.hidden = true; alerts.replaceChildren(); return; }
    alerts.hidden = false;
    const top = list[0], g = top.kind === "official" ? glyphOf(top.w) : top.c.icon;
    const sub = s.kind === "one" ? (top.kind === "official" ? top.w.headline || top.w.issuer || "" : top.c.text || "") : "See them all in Warnings";
    const b = h("button", { class: "wx-alert", type: "button", data: { level: s.level, colour: s.colour || "", kind: s.kind }, onclick: () => fw.nav.section("warnings"),
      "aria-label": `${s.kind === "banner" ? s.text : s.text}. Open Warnings` },
      h("span", { class: "wx-wchip", data: { colour: s.colour || (s.level === "alert" ? "red" : "yellow") }, svg: glyph(g, 18) }),
      h("span", { class: "wx-alert-words" }, h("b", {}, s.kind === "banner" ? `${s.n} warnings` : s.text), h("small", {}, s.kind === "banner" ? s.line : sub)),
      h("span", { class: "wx-chev", svg: glyph("chevron", 16) }));
    alerts.replaceChildren(b);
  }

  // ---- the cards ----
  const made = new Map();
  const later = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => alive && fn()) : setTimeout(fn, 0));
  function nowcastCard(wx, now, f) {
    const nc = I.nowcast(wx, now, f);
    if (!nc || (!nc.now && nc.startsAt - now > 2 * HOUR)) return null;
    const m = (wx.minutely || []).filter((x) => x.t + 15 * 60e3 > now), led = (x) => (x.radar ?? 0) >= 0.5;
    const host = chartHost("rain");
    const card = wxCard(ctx, { id: "nowcast", title: "Next 4 hours", g: "rain", extra: led(m[0] || {}) ? h("span", { class: "wx-src" }, glyphEl("radar", 14), "Radar") : null },
      h("p", { class: "wx-lede" }, nc.text), host);
    const L = LIGHT_MMH, H = HEAVY_MMH;
    const band = (mmh) => (mmh <= 0 ? 0 : mmh < L ? Math.sqrt(mmh / L) : mmh < H ? 1 + Math.log(mmh / L) / Math.log(H / L) : Math.min(3, 2 + Math.log(mmh / H) / Math.log(4)));
    later(() => timeChart(host, {
      kind: "columns", height: 120, color: COLOR.rain, key: `${cell(wx.place.lat, wx.place.lon)}:nc`,
      points: m.map((x) => ({ t: x.t, v: band(x.precip * 4), mm: x.precip, radar: led(x) })),
      y: { min: 0, max: 3, ticks: [1, 2, 3], fmt: (v) => ["", "Light", "Moderate", "Heavy"][v], inside: true },
      x: { step: 15 * 60e3, hour: (t) => f.time(t) },
      now, summary: `Rain, every 15 minutes for the next 4 hours, on a scale of light, moderate and heavy. ${nc.text}`,
      tip: (p) => ({ title: p.radar ? `${f.time(p.t)} · radar` : f.time(p.t), rows: [[f.rate(p.mm * 4), p.mm >= 0.05 ? ["light", "moderate", "heavy"][heaviness(p.mm * 4) - 1] : "dry"]] }),
      table: { head: ["Time", "Rain"], rows: m.map((x) => [f.time(x.t), f.rate(x.precip * 4)]) },
    }));
    return card;
  }
  // (each zone's sunlight asked for at most every half hour, kept for when it's offline: app.js sunHours)
  const sunKept = new Map(), sunAsking = new Set();
  function sunHours(z) {
    const k = `solar:${cell(z.lat, z.lon)}|${z.faces}|${z.pitch}`;
    if (!sunKept.has(k)) { const v = store.get(k); if (v?.hours) sunKept.set(k, v); }
    const kept = sunKept.get(k);
    if ((!kept || Date.now() - kept.at > 30 * 60e3) && !sunAsking.has(k)) {
      sunAsking.add(k);
      fetchSolar(z.lat, z.lon, z.faces, z.pitch).then((hours) => {
        const v = { at: Date.now(), hours }; sunKept.set(k, v); store.set(k, v);
        if (alive) { bigSig = null; draw(); }
      }, () => {}).finally(() => sunAsking.delete(k));
    }
    return kept?.hours || null;
  }
  function sunChart(sp, now, f) {
    const hs = sp.hours;
    if (hs.length < 2) return "";
    const a = hs[0].t - HOUR, b = hs[hs.length - 1].t, W = 320, top = 4, base = 56, x = (t) => 6 + ((t - a) / (b - a)) * (W - 12), bw = Math.max(3, (W - 12) / hs.length - 4), k = base - top - 4;
    const one = hs[0].parts.length === 1;
    let s = `<svg viewBox="0 0 ${W} 74" width="100%" role="img" aria-label="Sun on your panels today: from about ${f.time(sp.start)} to ${f.said(sp.end)}">`;
    s += `<rect class="sun-spell" x="${x(sp.start)}" y="${top}" width="${x(sp.end) - x(sp.start)}" height="${base - top}" rx="6"/>`;
    for (const hh of hs) {
      let y = base;
      hh.parts.forEach((v, i) => { const bh = v * k; if (bh < 0.5) return; y -= bh;
        s += `<rect x="${x(hh.t - HOUR) + 2}" y="${y}" width="${bw}" height="${bh}" rx="2" fill="${one ? (hh.in ? ZONE_COLOURS[0] : "currentColor") : ZONE_COLOURS[i % ZONE_COLOURS.length]}"${one && !hh.in ? ' opacity=".4"' : ""}/>`; });
    }
    if (now > a && now < b) s += `<line x1="${x(now)}" x2="${x(now)}" y1="${top}" y2="${base}" stroke="currentColor" stroke-width="1.5"/>`;
    s += `<line x1="6" x2="${W - 6}" y1="${base}" y2="${base}" stroke="currentColor" opacity=".35"/>`;
    for (let t = Math.ceil(a / (3 * HOUR)) * 3 * HOUR; t <= b; t += 3 * HOUR) s += `<text x="${Math.min(W - 18, Math.max(18, x(t)))}" y="${base + 14}" fill="currentColor" opacity=".8" font-size="10.5" text-anchor="middle">${f.time(t)}</text>`;
    return s + "</svg>";
  }
  function solarCard(wx, now, f) {
    const s = ctx.S.settings?.solar, here = s?.on ? s.zones.filter((z) => cell(z.lat, z.lon) === cell(wx.place.lat, wx.place.lon)) : [];
    const zs = here.map((zone) => ({ zone, hours: sunHours(zone) })), sp = zs.length && zs.every((z) => z.hours) ? zonesSpell(zs, now) : null;
    if (!sp) return null;
    const say = zonesSay(sp, now, f), by = new Map(sp.zones.map((x) => [x.zone.id, x]));
    return wxCard(ctx, { id: "solar", title: "Solar", g: "sun" },
      h("p", { class: "wx-lede" }, say.title), h("p", { class: "wx-text" }, say.text), h("div", { class: "wx-solar-chart", svg: sunChart(sp, now, f) }),
      zs.length > 1 ? h("div", { class: "wx-solar-zones" }, zs.map((z, i) => { const x = by.get(z.zone.id);
        return h("div", { class: "solar-zone" }, setVar(h("i"), "--zc", ZONE_COLOURS[i % ZONE_COLOURS.length]),
          h("span", {}, z.zone.name, h("small", {}, zoneSaid(z.zone))), h("b", {}, x ? `${f.time(x.sp.start)}–${f.said(x.sp.end)}` : "Little sun")); })) : null);
  }
  function hourlyCard(wx, now, f) {
    if (!chosen) mode = viewFor(wx, now, f);
    const hrs = I.hoursFrom(wx, now, 48), host = chartHost(mode);
    const seg = ui.seg([["temp", "Temp"], ["rain", "Rain"], ["wind", "Wind"]], mode, (v) => { mode = v; chosen = true; hourChart(host, wx, nowWall(wx.place.offset), hrs, mode, true, ctx.S.f || f); }, { label: "Chart" });
    seg.dataset.key = "metric";
    const card = wxCard(ctx, { id: "hourly", title: "Next 48 hours", g: "clock", extra: seg }, strip(wx, now, f, hrs), host);
    later(() => hourChart(host, wx, now, hrs, mode, true, f));
    return card;
  }
  function rightNowCard(wx, now, f) {
    return wxCard(ctx, { id: "right-now", title: "Right now", g: "gauge", cls: "wx-rightnow" }, tilesEl(ctx, wx, now, f));
  }
  function moreOf(c, wx, now, f) {
    if (c.day) { const d = wx.daily.find((x) => x.key === c.day); return d ? { label: `${f.day(d.date, now)} in full`, open: () => ctx.open.day(c.day) } : null; }
    const t = c.tile && TILES.find((x) => x[0] === c.tile);
    return t ? { label: c.tile === "sun" ? "Sunrise and sunset" : `${t[1]}, hour by hour`, open: () => ctx.open.detail(c.tile) } : null;
  }
  function insightsCard(wx, now, f) {
    let prev = null;
    try { prev = ctx.core.baseline?.(wx, now) ?? null; } catch (_) {}
    const all = I.insights(wx, now, f, { prev, commute: ctx.S.settings?.commute });
    const brief = I.headline(wx, now, f), today = keyOf(now);
    const elsewhere = (c) => ["uv", "air", "pressure", "wind"].includes(c.id) || (c.id === "umbrella" && /\b(rain|showers?|drizzle|snow|sleet)\b/i.test(brief)) || (c.id === "normal" && c.day === today);
    const rest = all.filter((c) => c.level !== "alert" && c.level !== "warn" && !elsewhere(c));
    if (!rest.length) return null;
    const shown = allIns ? rest : rest.slice(0, 3);
    const rows = shown.map((c) => {
      const go = moreOf(c, wx, now, f);
      const r = ui.row({ lead: glyphEl(c.icon, 18), title: c.title, sub: c.short && c.short !== c.text ? `${c.short} ${c.text}` : c.text, trail: go ? "chevron" : null, run: go ? go.open : null, label: go ? `${c.title}: ${go.label}` : null });
      r.classList.add("wx-ins");
      if (c.level) r.dataset.level = c.level;
      return r;
    });
    const more = rest.length > 3 ? ui.btn(allIns ? "Show Less" : `${rest.length - shown.length} More`, { small: true, run: () => { allIns = !allIns; bigSig = null; draw(); } }) : null;
    return wxCard(ctx, { id: "insights-card", title: "Highlights", g: "star" }, ui.list(rows), more);
  }
  function windowsCard(wx, now, f) {
    const list = I.windows(wx, now, f, { activities: ctx.S.settings?.activities, extras: ctx.S.settings?.extras });
    if (!list.length) return null;
    const tile = (w) => h("div", { class: `wx-win${w.rating === "Poor" ? " poor" : ""}` },
      h("div", { class: "win-name" }, glyphEl(w.icon, 16), w.name),
      h("div", { class: "win-day" }, h("span", {}, w.start == null ? "Not today or tomorrow" : f.day(w.start, now)), h("span", { class: "win-rate", data: { r: w.rating } }, w.rating)),
      w.start == null ? null : h("div", { class: "win-time" }, `${w.end && w.start <= now && w.end > now ? "Now" : f.time(w.start)}${w.end ? `–${f.time(w.end)}` : ""}`),
      h("div", { class: "win-text" }, w.text));
    const good = list.filter((w) => w.rating !== "Poor"), poor = list.filter((w) => w.rating === "Poor");
    const grid = h("div", { class: "wx-win-grid" }, good.map(tile), allWins ? poor.map(tile) : []);
    const line = poor.length && !allWins ? h("button", { class: "wx-win-poor", type: "button", "aria-label": `Not looking good today or tomorrow: ${poor.map((w) => w.name).join(", ")}. Show them`, onclick: () => { allWins = true; bigSig = null; draw(); } },
      h("span", {}, h("b", {}, good.length ? "Not looking good: " : "Nothing looking good today or tomorrow: "), poor.map((w) => w.name).join(", ")), h("span", { class: "wx-chev", svg: glyph("chevron", 14) })) : null;
    return wxCard(ctx, { id: "windows", title: "Best times", g: "star" }, grid, line);
  }
  function accuracyCard(wx, f) {
    const k = wx.skill;
    if (!k?.station) return null;
    const st = k.skill ? null : k.station, note = (t) => h("p", { class: "wx-note" }, t);
    if (st) return wxCard(ctx, { id: "accuracy", title: "Forecast accuracy here", g: "target" }, note(k.obsDays >= MIN_DAYS ? `Not enough past forecasts to compare with ${st.name}'s reports yet.` : `Recording ${st.name}'s reports: ${k.obsDays} of ${MIN_DAYS} days.`));
    const s = k.skill;
    return wxCard(ctx, { id: "accuracy", title: "Forecast accuracy here", g: "target" },
      note(`${k.station.name} (${f.dist(k.station.km * 1000)}) · last ${s.days} days`),
      h("table", { class: "wx-models acc" }, h("caption", { class: "vh" }, "Each model's average error and lean, next-day forecasts"),
        h("tr", {}, h("th", { scope: "col" }, "Model"), h("th", { scope: "col" }, "Highs"), h("th", { scope: "col" }, "Lows"), h("th", { scope: "col" }, "Leans")),
        ...s.models.map((m, i) => h("tr", {}, h("td", {}, m.name, i === 0 ? h("span", { class: "best" }, "Best") : null), h("td", {}, `±${f.deltaFine(m.hiMae)}`),
          h("td", {}, m.loMae != null ? `±${f.deltaFine(m.loMae)}` : "–"), h("td", {}, Math.abs(m.hiBias) >= 0.5 ? `${f.deltaFine(m.hiBias)} ${m.hiBias > 0 ? "warm" : "cold"}` : "–")))),
      s.days < TUNE_DAYS ? note(`Tuning starts at ${TUNE_DAYS} days.`) : null);
  }
  function climateCard(wx, now, f) {
    const t = f.units.temp === "f" ? (c) => c * 9 / 5 + 32 : (c) => c;
    const head = { id: "climate", title: "This time of year", g: "chart" };
    if (!wx.climate) {
      const failed = store.get(`clim2:${cell(wx.place.lat, wx.place.lon)}`)?.failedAt;
      return wxCard(ctx, head, h("p", { class: "wx-note" }, failed ? "The climate archive is busy; this will fill in later." : "Gathering 30 years of weather…"));
    }
    const d = I.dayOf(wx, now), c = d && climateOn(wx.climate, d.date);
    if (!c?.tmax) return wxCard(ctx, head, h("p", { class: "wx-note" }, "No climate record for this spot."));
    const p = rankIn(c.tmax.sorted, d.tmax), ago = yearsAgo(wx.climate, d.date), chart = h("div", { class: "wx-range-chart" });
    const fact = (v, k) => h("li", {}, h("b", {}, v), k);
    const card = wxCard(ctx, head, h("p", { class: "wx-lede" }, `Warmer than ${Math.round(p)}% of days here since ${wx.climate.years[0]}.`), chart,
      h("ul", { class: "wx-facts" }, fact(f.temp(c.tmax.mean), "Normal high"), fact(f.temp(c.tmin.mean), "Normal low"),
        c.recordHigh ? fact(`${f.temp(c.recordHigh.v)} (${c.recordHigh.year})`, `Warmest ${f.dateLong(d.date)}`) : null,
        c.recordLow ? fact(`${f.temp(c.recordLow.v)} (${c.recordLow.year})`, `Coldest ${f.dateLong(d.date)} night`) : null,
        c.wet != null ? fact(`${Math.round(c.wet * 100)}%`, "Days with rain") : null,
        ago ? fact(`${f.temp(ago.tmax)}, ${ago.rain >= 0.5 ? f.precip(ago.rain) : "dry"}`, "This day last year") : null));
    later(() => rangeChart(chart, { key: cell(wx.place.lat, wx.place.lon), p10: t(c.tmax.p10), p25: t(c.tmax.p25), p75: t(c.tmax.p75), p90: t(c.tmax.p90), mean: t(c.tmax.mean), value: t(d.tmax), valueLabel: `Today ${f.temp(d.tmax)}`, record: c.recordHigh ? { v: t(c.recordHigh.v), year: c.recordHigh.year } : null,
      fmt: (v) => f.deg(v), summary: `Today's high ${f.temp(d.tmax)} against the normal range for the date: ${f.temp(c.tmax.p10)} to ${f.temp(c.tmax.p90)}, normal ${f.temp(c.tmax.mean)}.` }));
    return card;
  }
  function askCard() {
    const r = ctx.S.ask;
    if (!r || ctx.S.acct) return null;
    return wxCard(ctx, { id: "ask", title: "Your places", g: "person", cls: "wx-ask" },
      h("p", { class: "wx-text" }, `${r.name ? `${r.name}${r.handle ? ` (@${r.handle})` : ""}` : "Your account"} is signed in on this browser. Keep this device’s places and settings with this account, the same on every device it’s signed in on?`),
      h("div", { class: "wx-acts" },
        ui.btn(r.handle ? `Keep Them with @${r.handle}` : "Keep Them", { primary: true, small: true, run: () => ctx.core.answerAsk(true) }),
        ui.btn("Not Now", { small: true, run: () => ctx.core.answerAsk(false) })));
  }
  function drawCards(wx, now, f) {
    const S = ctx.S, list = [];
    const ask = askCard();
    if (ask) list.push(ask);
    for (const k of nowOrder(S.settings?.layout)) {
      let c = null;
      try {
        c = k === "nowcast" ? nowcastCard(wx, now, f) : k === "solar" ? solarCard(wx, now, f) : k === "hourly" ? hourlyCard(wx, now, f) : k === "right-now" ? rightNowCard(wx, now, f)
          : k === "insights-card" ? insightsCard(wx, now, f) : k === "windows" ? windowsCard(wx, now, f) : k === "accuracy" ? accuracyCard(wx, f) : k === "climate" ? climateCard(wx, now, f) : null;
      } catch (e) { console.error(e); }
      if (c) list.push(c);
    }
    cards.replaceChildren(...list);
  }

  function draw() {
    if (!alive) return;
    const S = ctx.S, wx = S.wx, f = S.f || makeFormat(S.settings || {});
    const now = wx ? nowWall(wx.place.offset) : Date.now();
    if (!wrap.isConnected || wrap.parentNode !== el) el.replaceChildren(wrap);
    drawHero(wx, now, f);
    if (ctx.hint !== zoomedFor && (wx || ctx.hint)) { zoomedFor = ctx.hint; try { fw.zoomTarget(hero); } catch (_) {} }
    updated.textContent = wx ? `Updated ${agoOf(wx.fetchedAt || S.updatedAt || Date.now())}` : "";
    refresh.disabled = !!S.loading;
    if (!wx) {
      if (bigSig !== "none") { bigSig = "none"; alerts.hidden = true; alerts.replaceChildren(); cards.replaceChildren(ui.skeleton("card", 2)); }
      return;
    }
    const st = S.settings || {};
    const sig = JSON.stringify([wx.place.lat, wx.place.lon, wx.fetchedAt, S.updatedAt, f.units, st.layout, st.solar, st.activities, st.extras, st.commute, st.tune, S.ask?.handle ?? null, !!S.acct, Math.floor(now / 300e3), allIns, allWins, wx.official?.length ?? null, !!wx.climate, !!wx.skill?.skill]);
    if (sig === bigSig) return;
    bigSig = sig;
    drawAlerts(wx, now);
    drawCards(wx, now, f);
  }
  return {
    draw,
    hide() {},
    destroy() { alive = false; bigSig = heroSig = null; el.replaceChildren(); made.clear(); },
  };
}

export { codeInfo, inForce, colourOf, titleOf, openDetail, openCredits, icon };
