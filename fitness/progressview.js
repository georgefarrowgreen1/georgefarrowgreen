// Fitness's Progress: how you're coming on, the story first; power, training and engine, each a sheet (progress.js
// has the figures). Drawn by app.js render.

import { nightsFrom, nightsSeries, U, distNum, stat } from "./app.js";
import { nightsView } from "./today.js";
import { A, C, DAY, G, M, P, R, S, Sheet, TODAY, addDays, card, cardW, dayName, dayShort, dist, dur, fitness, fitnessSeries, formSaid, garminView, h, head, height, hm, icon, isSet, mondayOf, once, openSheet, pace, plural, record, redraw, rh, rhythmOn, row, section, sheetW, signed, startOfDay, store, sumOf, svgOf, weeks, weight } from "./app.js";
import { formView, openAct, staying, uploadFilesView } from "./activities.js";

// ---- Progress: how you're coming on, the story first (progress.js has the figures) ----
const RANGES = [[42, "6 wk"], [91, "3 mo"], [182, "6 mo"], [365, "Year"]];
// (each with its figures as now; its time in zones as worked out when it came in, where a new FTP has cleared them since)
// (your activities as Progress takes them: made once a change)
const progActs = once(() => S.own.map((a) => { const s = sumOf(a) || a.sum; return { id: a.id, name: a.name, start: a.start, sport: a.sport, sum: s && { ...s, zones: s.zones || a.sum?.zones, hrZones: s.hrZones || a.sum?.hrZones } }; }).filter((a) => a.sum));
const monthOf = (t, len = "long") => new Date(t).toLocaleDateString("en-GB", { month: len });
const pRange = () => { const d = store.get("prange", 182); return RANGES.some(([v]) => v === d) ? d : 182; };
const f1n = (v) => (Math.round(v * 10) / 10).toFixed(1);
const signedW = (v) => (v > 0 ? `+${v} W` : v < 0 ? `−${-v} W` : "Held");
// FTP on a day, from its log (before the log began: the first it has; none at all: today's)
function ftpOn(day) {
  const log = P().ftpLog || [];
  let v = log.length ? log[0][1] : P().ftp;
  for (const [d, w] of log) if (d <= day) v = w;
  return v;
}
function progressView() {
  const days = pRange(), from = addDays(TODAY, -days), acts = progActs(), inRange = acts.filter((a) => a.start >= from), at = RANGES.findIndex(([v]) => v === days);
  const out = [head("Progress", acts.length ? `Since ${monthOf(from)} · ${plural(inRange.length, "activity", "activities")}` : "Nothing yet")];
  out.push(h("div.seg.wide.p-range", { vars: { "--n": 4, "--at": at }, role: "group", "aria-label": "Range" }, RANGES.map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": String(v === days), onclick: () => { store.set("prange", v); redraw(); } }, l))));
  if (!acts.length || !S.summed) {
    out.push(h("div.card.glass.p-empty", {}, h("span.big.ic.blue", {}, icon("trend", 26, 2.2)), h("h2", { text: "Your progress, as your rides come in" }),
      h("p", { text: "Fitness, records, how you’re riding and what’s changing: it all fills in from your activities." }),
      h("button.btn", { type: "button", onclick: () => openSheet(S.garmin?.on ? uploadFilesView : garminView) }, "Bring your rides in")));
    return out;
  }
  // the story: fitness over the range, and where it's heading
  const f = fitnessSeries(), pts = f.filter((x) => x.day >= from), last = f.at(-1);
  const fit = Math.round(last.ctl), gain = Math.round(last.ctl - (pts[0]?.ctl ?? last.ctl)), top = Math.max(...f.map((x) => x.ctl));
  let ramp = 0; for (let i = 7; i < pts.length; i++) ramp = Math.max(ramp, pts[i].ctl - pts[i - 7].ctl);
  // (where it's heading: the last fortnight's rise carried on a while, a fifth of the range, between 10 days and 5 weeks)
  const ahead = Math.round(Math.min(35, Math.max(10, days * 0.2))), slope = f.length > 15 ? (last.ctl - f.at(-15).ctl) / 14 : 0, proj = slope > 0.05 ? Math.round(last.ctl + slope * ahead) : null;
  const badge = last.ctl >= top - 0.5 && gain > 0 ? "The fittest you’ve been" : gain > 2 ? "Building" : gain < -2 ? "Easing off" : "Holding steady";
  const said = gain > 0 ? `Up ${gain} since ${monthOf(from)}${ramp >= 1 ? `, never more than ${Math.ceil(ramp)} a week` : ""}.${proj && proj > fit ? ` At this rate, ${proj} by ${ahead >= 28 ? monthOf(addDays(TODAY, ahead)) : dayShort(addDays(TODAY, ahead))}.` : ""}`
    : gain < 0 ? `Down ${-gain} since ${monthOf(from)}: ${last.tsb > 5 ? "fresher for it." : "a lighter spell."}` : `Level since ${monthOf(from)}.`;
  out.push(h("div.card.p-hero", {},
    h("span.p-badge", {}, icon("trend", 12, 3), badge),
    h("div.p-big", {}, h("b", { text: String(fit) }), h("span", { text: "fitness" }), h("span.p-gain", { text: gain >= 0 ? `+${gain}` : `−${-gain}` })),
    h("p", { text: said }), heroChart(pts, proj, from, acts, ahead)));
  // the tiles: FTP, power to weight, your average week, and form
  const wk = G.weekly(acts, TODAY, Math.max(6, Math.ceil(days / 7))), avg = wk.reduce((a, w) => a + w.secs, 0) / wk.length, ftp0 = ftpOn(from), dF = P().ftp - ftp0, said2 = formSaid(last.tsb);
  const log = [[from, ftp0], ...(P().ftpLog || []).filter((x) => x[0] > from).map((x) => [x[0], x[1]]), [TODAY, P().ftp]];
  const twelve = G.weekly(acts, TODAY, 12), maxW = Math.max(1, ...twelve.map((w) => w.secs));
  out.push(h("div.p-tiles", {},
    pTile("FTP", "c-ftp", [`${P().ftp}`, " W"], svgOf(stepSpark(log, from)), dF ? signedW(dF) : "Held", dF >= 0, () => openSheet(engineView, { tall: true })),
    pTile("Power to weight", "c-wkg", [f1n(P().ftp / P().weight), " W/kg"], svgOf(stepSpark(log.map(([d, w]) => [d, w / P().weight]), from)), dF ? `${dF > 0 ? "+" : "−"}${f1n(Math.abs(dF) / P().weight)}` : "Held", dF >= 0, () => openSheet(engineView, { tall: true })),
    pTile("A week, on average", "c-wk", [dur(avg)], h("span.p-bars", { "aria-hidden": "true" }, twelve.map((w, i) => h("i" + (i === 11 ? ".now" : ""), { vars: { "--h": Math.max(4, (w.secs / maxW) * 100) + "%" } }))), `${Math.round(wk.reduce((a, w) => a + w.tss, 0) / wk.length)} TSS`, null, () => openSheet(trainingView, { tall: true })),
    h("button.p-tile.p-form", { type: "button", onclick: () => openSheet(formView) }, svgOf(ringSvg(Math.max(0, Math.min(1, (last.tsb + 30) / 50)), signed(last.tsb), "form")), h("span.tx", {}, h("small", { text: "Form" }), h("b", { text: said2.word }), h("small", { text: said2.tone === "fresh" ? "Ready for a hard day" : said2.tone === "high" ? "Time for an easy day" : said2.tone === "productive" ? "Getting fitter" : "Steady" })))));
  // your nights, the last two months, against your training (from your Apple Watch or Garmin, where they come in)
  const src = nightsFrom(), ns = src ? nightsSeries(60) : null, had = ns ? ns.filter((x) => x.hrv != null || x.rhr != null || x.sleep != null).length : 0;
  if (had >= 3) out.push(section(["Recovery", h("span.aside", { text: src === "apple" ? "Apple Watch" : "Garmin" })],
    h("button.card.glass.p-nights", { type: "button", onclick: () => openSheet(nightsView, { tall: true }), "aria-label": "Your nights, in full" }, C.nightsChart(ns, { W: cardW() }))));
  // your history, where there's most of a year of it: this year against last, the bests of all time, each year's peak
  if (Math.min(...acts.map((a) => a.start)) < addDays(TODAY, -300)) out.push(...historySection(acts, f));
  // what stands out
  const cards = insights(acts, from);
  out.push(section(["What stands out", h("span.aside", { text: cards.length > 1 ? `${cards.length} things` : "" })], cards.length ? h("div.p-cards", {}, cards) : h("p.foot.none", { text: "Ride a few more weeks, and what stands out shows here." })));
  // every day, the last 26 weeks
  out.push(section(["Every day", h("span.aside", { text: `${new Set(acts.filter((a) => a.start >= addDays(TODAY, -181)).map((a) => startOfDay(a.start))).size} days riding` })], calendarCard(acts)));
  out.push(section(null, h("div.group.glass", {},
    row({ icon: "medal", tint: "amber", title: "Power", sub: "Your curve, records and what kind of rider", onclick: () => openSheet(powerView, { tall: true }) }),
    row({ icon: "list", tint: "blue", title: "Training", sub: "Volume, consistency and how hard", onclick: () => openSheet(trainingView, { tall: true }) }),
    row({ icon: "heart", tint: "red", title: "Engine", sub: "FTP, efficiency and staying power", onclick: () => openSheet(engineView, { tall: true }) }))));
  return out;
}
// ---- your history ----
const fullDist = (m) => { const [v, u] = distNum(m); return `${Number(v) >= 100 ? Math.round(Number(v)).toLocaleString("en-GB") : v} ${u}`; };
function historySection(acts, f) {
  const y = G.yearOf(TODAY), cur = G.cumulative(acts, y, TODAY), prev = G.cumulative(acts, y - 1), at = cur.at(-1), then = prev[Math.min(prev.length - 1, at[0])];
  const km = (m) => (U.metric ? m / 1000 : m / 1609.344), unit = U.metric ? "km" : "mi", pct = then?.[1] > 0 ? Math.round((at[1] / then[1] - 1) * 100) : null;
  const [v, u] = distNum(at[1]), first = G.yearOf(Math.min(...acts.map((a) => a.start)));
  const pk = G.peaks(f), years = Object.keys(pk).map(Number).filter((x) => x >= first).sort((a, b) => b - a).slice(0, 5), top = Math.max(1, ...years.map((x) => pk[x].ctl));
  const bests = G.allTime(acts, TODAY);
  return [
    section(["Your history", h("span.aside", { text: `Since ${first}` })],
      h("button.card.glass.p-history", { type: "button", onclick: () => openYear(y), "aria-label": `${y} so far: ${fullDist(at[1])}. Your year in review` },
        h("div.ph-top", {}, h("div", {}, h("small", { text: `${y} so far` }), h("b", {}, Number(v) >= 100 ? Math.round(Number(v)).toLocaleString("en-GB") : v, h("u", { text: ` ${u}` }))),
          pct != null && h("span.ph-vs" + (pct > 0 ? ".up" : pct < 0 ? ".down" : ""), { text: pct ? `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% on ${y - 1} by now` : `Level with ${y - 1} by now` })),
        C.yearsChart(cur, prev, { W: cardW(), km, unit, years: [y, y - 1] }),
        h("div.n-key", {}, h("span", {}, h("i.k-cur"), String(y)), prev.at(-1)?.[1] > 0 && h("span", {}, h("i.k-prev"), String(y - 1)), h("span.ph-more", {}, "Year in review", icon("chev", 13, 2.6))))),
    section("All-time bests", h("div.group.glass.ph-bests", {}, bests.map((b) => h("div.row.plain", {}, h("span.ph-len", { text: b.short }),
      h("span.tx", {}, h("b", { text: `${b.ever.w} W` }), h("small.one-line", { text: `${G.yearOf(b.ever.start)} · ${b.ever.name}` })),
      h("span.val.ph-yr" + (b.isBest ? ".best" : ""), { text: b.isBest ? `Set in ${y}` : b.year ? `${b.year.w} W in ${y}` : `None in ${y}` }))))),
    years.length > 1 && section("Fitness at its peak", h("div.card.glass.ph-peaks", {}, years.map((x) => h("div.pk-row" + (x === y ? ".now" : ""), {},
      h("small", { text: String(x) }), h("span.pk-bar", {}, h("i", { vars: { width: Math.max(4, (pk[x].ctl / top) * 100) + "%" } })), h("b", { text: String(Math.round(pk[x].ctl)) }),
      h("small.pk-when", { text: new Date(pk[x].day).toLocaleDateString("en-GB", { month: "short" }) }))))),
  ].filter(Boolean);
}
// A year in review: its figures, month by month, and its highlights; the years you have, one tap each
function yearView(year) {
  const acts = progActs(), f = fitnessSeries(), ys = [...new Set(acts.map((a) => G.yearOf(a.start)))].sort((a, b) => b - a).slice(0, 6), at = Math.max(0, ys.indexOf(year));
  const r = G.yearReview(acts, year, f), now = year === G.yearOf(TODAY), MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const top = r ? r.months.indexOf(Math.max(...r.months)) : -1;
  return { title: "Year in review", body: [
    h("div.sheet-top", {}, h("h1", { text: now ? `${year} so far` : `${year} in review` }), h("div.sub", { text: r ? `${plural(r.count, "activity", "activities")} on ${plural(r.days, "day")}` : "Nothing this year" })),
    ys.length > 1 && h("div.seg.wide", { vars: { "--n": ys.length, "--at": at }, role: "group", "aria-label": "Year" }, ys.map((y) => h("button", { type: "button", "aria-pressed": String(y === year), onclick: () => { yearView.at = y; Sheet.redraw(); } }, String(y)))),
    r && card(null, null, h("div.stats", {}, stat("Distance", fullDist(r.dist)), stat("Time", `${Math.round(r.secs / 3600).toLocaleString("en-GB")} h`), stat("Climbing", height(r.ascent)), stat("Rides", String(r.rides)), stat("Days out", String(r.days)), stat("Training stress", Math.round(r.tss).toLocaleString("en-GB")))),
    r && section(["Month by month", h("span.aside", { text: r.months[top] ? `Most in ${MONTHS[top]}` : "" })], card(null, null, C.monthBars(r.months, { W: sheetW() }))),
    r && section("Highlights", h("div.group", {},
      r.longest && row({ icon: "ride", tint: "coral", title: "The longest", sub: `${r.longest.name} · ${dayShort(r.longest.start)}`, value: dur(r.longest.secs), chev: false }),
      r.bigWeek && row({ icon: "calendar", tint: "blue", title: "The biggest week", sub: `From ${dayShort(r.bigWeek.mon)}`, value: dur(r.bigWeek.secs), chev: false }),
      r.best20 && row({ icon: "bolt", tint: "amber", title: "The best 20 minutes", sub: `${r.best20.name} · ${dayShort(r.best20.start)}`, value: `${r.best20.w} W`, chev: false }),
      r.peak && row({ icon: "trend", tint: "green", title: "Fitness at its peak", sub: new Date(r.peak.day).toLocaleDateString("en-GB", { day: "numeric", month: "long" }), value: String(Math.round(r.peak.ctl)), chev: false }))),
  ].filter(Boolean) };
}
// (the year shown, kept as you pick another: the sheet's drawn again from it)
function openYear(y) { yearView.at = y; openSheet(() => yearView(yearView.at), { tall: true }); }
function pTile(label, c, big, chart, delta, up, onclick) {
  return h("button.p-tile", { type: "button", onclick }, h("small", {}, h("i." + c), label), h("b", {}, big[0], big[1] && h("u", { text: big[1] })), h("span.p-spark." + c, {}, chart),
    h("span.p-delta" + (up === true ? ".up" : up === false ? ".down" : ""), { text: delta }));
}
// a tiny stepped line, of values by day ([day, value] from the range's start to today)
function stepSpark(log, from) {
  const W = 140, H = 30, span = Math.max(DAY, TODAY - from), vs = log.map((x) => x[1]), lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
  const x = (d) => Math.max(0, Math.min(W, ((d - from) / span) * W)), y = (v) => H - 4 - ((v - lo) / r) * (H - 8);
  let d = `M0 ${y(log[0][1]).toFixed(1)}`;
  for (let i = 1; i < log.length; i++) d += `H${x(log[i][0]).toFixed(1)}V${y(log[i][1]).toFixed(1)}`;
  d += `H${W}`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
// a ring, part full, a word in it
function ringSvg(frac, word, cls) {
  const r = 22, c = 2 * Math.PI * r;
  return `<svg class="p-ring ${cls}" width="56" height="56" viewBox="0 0 56 56" role="img" aria-label="${cls} ${word}"><circle cx="28" cy="28" r="${r}" class="bg"/><circle cx="28" cy="28" r="${r}" class="fg" stroke-dasharray="${(frac * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/><text x="28" y="33" text-anchor="middle">${word}</text></svg>`;
}
// fitness over the range, glowing; a dotted line to where it's heading; and a record, where there's one
function heroChart(pts, proj, from, acts, aheadDays) {
  if (pts.length < 2) return null;
  const W = cardW(true), H = 150, B = 26, n = pts.length, step = Math.max(1, Math.floor(n / 90)), use = pts.filter((_, i) => i % step === 0 || i === n - 1);
  const ahead = proj ? aheadDays : 0, span = Math.max(1, TODAY - from + ahead * DAY), vs = [...use.map((p) => p.ctl), proj || 0], lo = Math.min(...vs) * 0.9, hi = Math.max(...vs) * 1.06 || 1;
  const x = (d) => ((d - from) / span) * (W - 6) + 3, y = (v) => H - B - ((v - lo) / (hi - lo)) * (H - B - 14);
  const line = use.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.ctl).toFixed(1)}`).join(""), lx = x(TODAY), ly = y(pts.at(-1).ctl);
  let marks = "";
  // (your best 20 minutes in the range, where it's your best ever)
  const b = G.bests(acts, from)[1200], all = G.bests(acts)[1200];
  if (b && all && b.id === all.id) { const p = pts.find((q) => q.day >= startOfDay(b.start)), px = p && x(p.day);
    // (its words only where they'd not sit on today's)
    if (p) marks += `<circle cx="${px.toFixed(1)}" cy="${y(p.ctl).toFixed(1)}" r="3.5" class="m-best"/>${lx - px > 50 ? `<text x="${px.toFixed(1)}" y="${(y(p.ctl) - 10).toFixed(1)}" text-anchor="middle">20-min best</text>` : ""}`; }
  return svgOf(`<svg class="p-hero-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fitness over the range${proj ? `, heading for ${proj}` : ""}">
    <defs><linearGradient id="phf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="phg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>
    <line x1="0" y1="${H - B}" x2="${W}" y2="${H - B}" class="axis"/>
    <path d="${line}L${lx.toFixed(1)} ${H - B}L${x(use[0].day).toFixed(1)} ${H - B}Z" fill="url(#phf)"/>
    <path d="${line}" class="ln"/>
    ${proj ? `<path d="M${lx.toFixed(1)} ${ly.toFixed(1)}L${(W - 3).toFixed(1)} ${y(proj).toFixed(1)}" class="proj"/>` : ""}
    ${marks}
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="10" class="glow" filter="url(#phg)"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5.5" class="dot"/>
    <text x="3" y="${H - 6}" class="lab">${monthOf(from, "short")}</text>${!proj || W - lx > 80 ? `<text x="${lx.toFixed(1)}" y="${H - 6}" text-anchor="${proj ? "middle" : "end"}" class="lab">Now</text>` : ""}${proj ? `<text x="${W - 3}" y="${H - 6}" text-anchor="end" class="lab">${aheadDays >= 28 ? monthOf(addDays(TODAY, aheadDays), "short") : dayShort(addDays(TODAY, aheadDays))}</text>` : ""}
  </svg>`);
}
// What stands out: a new best, your engine, how hard this month, consistency; each a card, each a tap to more
function insights(acts, from) {
  const out = [], cut = addDays(TODAY, -14), now = G.bests(acts, cut), before = G.bests(acts, -Infinity, cut);
  let pick = null;
  for (const [k, , words] of G.LENGTHS) { const n = now[k], b = before[k]; if (n && (!b || n.w > b.w)) { const rel = b ? (n.w - b.w) / b.w : 0.01; if (!pick || rel > pick.rel) pick = { k, words, n, b, rel }; } }
  const card = (cls, ic, kicker, title, sub, onclick) => h("button.p-card." + cls, { type: "button", onclick }, h("span.p-card-top", {}, h("span.ic", {}, icon(ic, 19, 2.2)), h("small", { text: kicker })), h("b", { text: title }), h("span", { text: sub }));
  if (pick) out.push(card("gold", "medal", "A new best", `${pick.n.w} W for ${pick.words}`, `${dayName(startOfDay(pick.n.start))}: ${pick.n.name}${pick.b ? `, ${pick.n.w - pick.b.w} W over your best before` : ""}.`, () => { S.plen = G.LENGTHS.findIndex(([k]) => k === pick.k); openSheet(powerView, { tall: true }); }));
  const e = G.efficiency(acts, from);
  if (e.enough && Math.abs(e.watts) >= 3) out.push(card("red", "heart", "Your engine", e.watts > 0 ? `${e.watts} W more, same heartbeat` : `${-e.watts} W less at the same heartbeat`, `On steady rides at ${e.hr} bpm, since ${monthOf(from)}.`, () => openSheet(engineView, { tall: true })));
  const it = G.intensity(acts, addDays(TODAY, -30));
  if (it && it.secs > 3 * 3600) { const pe = Math.round(it.easy * 100);
    out.push(card("blue", "gauge", "This month", `${pe}% easy`, it.easy >= 0.75 && it.mid < 0.15 ? "Right where it should be: the hard days count." : it.mid >= 0.2 ? "A lot in the grey middle: easy days easier, hard days harder." : it.easy < 0.7 ? "More hard riding than most can take in: lean on the easy days." : "A good mix, mostly easy.", () => openSheet(trainingView, { tall: true }))); }
  const st = G.streak(G.weekly(acts, TODAY, 52));
  if (st.now >= 3) out.push(card("green", "check", "Consistency", `${st.now} weeks in a row`, `Riding twice a week or more.${st.best > st.now ? ` Your best run: ${st.best} weeks.` : " Your best run yet."}`, () => openSheet(trainingView, { tall: true })));
  return out;
}
// every day of the last 26 weeks, a square each, deeper the harder it was
function calendarCard(acts) {
  const first = addDays(mondayOf(TODAY), -7 * 25), d = G.daily(acts, TODAY, 182 + 7), cells = [];
  const lvl = (t) => (t <= 0 ? 0 : t < 40 ? 1 : t < 80 ? 2 : t < 120 ? 3 : 4);
  for (let c = 0; c < 26; c++) for (let r = 0; r < 7; r++) {
    const day = addDays(first, c * 7 + r), i = Math.round((day - d.from) / DAY);
    cells.push(day > TODAY ? h("i.future") : h("i.l" + lvl(d.tss[i] || 0), { title: dayShort(day) }));
  }
  const months = []; for (let c = 0; c < 26; c += 1) { const day = addDays(first, c * 7); if (new Date(day).getDate() <= 7) months.push(h("span", { vars: { "--c": c }, text: monthOf(day, "short") })); }
  return h("div.card.glass.p-cal", {}, h("div.p-cal-grid", { role: "img", "aria-label": "Each day of the last six months, deeper the harder it was" }, cells),
    h("div.p-cal-foot", {}, h("div.p-cal-months", {}, months), h("span.p-cal-key", {}, "Less", [0, 1, 2, 3, 4].map((l) => h("i.l" + l)), "More")));
}

// Power: your best at every length, against the range before; tap a length; records; what kind of rider
function powerView() {
  const days = pRange(), from = addDays(TODAY, -days), acts = progActs(), b = G.bests(acts, from), prev = G.bests(acts, addDays(from, -days), from), all = G.bests(acts), old = G.bests(acts, -Infinity, addDays(TODAY, -14));
  const idx = S.plen ?? 2, [k, , words] = G.LENGTHS[idx], cur = b[k], up = cur && prev[k] ? cur.w - prev[k].w : null;
  const W = sheetW() + 36 - 36, H = 190, B = 22, lo5 = Math.log(5), hi5 = Math.log(3600);
  const xs = (t) => 4 + ((Math.log(t) - lo5) / (hi5 - lo5)) * (W - 8), vals = [...Object.values(b), ...Object.values(prev)].map((v) => v.w), top = Math.max(P().ftp * 1.2, ...vals) * 1.05, bot = Math.min(P().ftp * 0.7, ...vals) * 0.92;
  const ys = (v) => H - B - ((v - bot) / (top - bot)) * (H - B - 10);
  const path = (c) => G.CURVE_AT.filter((t) => c[t]).map((t, i) => `${i ? "L" : "M"}${xs(t).toFixed(1)} ${ys(c[t].w).toFixed(1)}`).join("");
  const p1 = path(b), p0 = path(prev), firstT = G.CURVE_AT.find((t) => b[t]), lastT = [...G.CURVE_AT].reverse().find((t) => b[t]);
  const mark = cur ? `<line x1="${xs(k).toFixed(1)}" y1="6" x2="${xs(k).toFixed(1)}" y2="${H - B}" class="cross"/><circle cx="${xs(k).toFixed(1)}" cy="${ys(cur.w).toFixed(1)}" r="9" class="halo"/><circle cx="${xs(k).toFixed(1)}" cy="${ys(cur.w).toFixed(1)}" r="5" class="pt"/>` : "";
  const chart = svgOf(`<svg class="p-curve" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your best power at every length from 5 seconds to an hour, against the range before">
    <defs><linearGradient id="pcf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7af0" stop-opacity="0.28"/><stop offset="1" stop-color="#2f7af0" stop-opacity="0"/></linearGradient><linearGradient id="pcl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c5cf0"/><stop offset="0.5" stop-color="#2f7af0"/><stop offset="1" stop-color="#1fa7c8"/></linearGradient></defs>
    <line x1="0" y1="${ys(P().ftp).toFixed(1)}" x2="${W}" y2="${ys(P().ftp).toFixed(1)}" class="ftp"/><text x="${W - 2}" y="${(ys(P().ftp) - 5).toFixed(1)}" text-anchor="end" class="ftpl">FTP ${P().ftp}</text>
    ${p0 ? `<path d="${p0}" class="was"/>` : ""}
    ${p1 ? `<path d="${p1}L${xs(lastT).toFixed(1)} ${H - B}L${xs(firstT).toFixed(1)} ${H - B}Z" fill="url(#pcf)"/><path d="${p1}" class="now" stroke="url(#pcl)"/>` : ""}
    ${mark}
    ${G.LENGTHS.map(([t, l]) => `<text x="${xs(t).toFixed(1)}" y="${H - 5}" text-anchor="${t === 5 ? "start" : t === 3600 ? "end" : "middle"}" class="lab">${l}</text>`).join("")}
  </svg>`);
  const rt = G.riderType(b, P().ftp);
  return { title: "Power", body: [
    h("div.card.glass.p-power", {},
      h("small.p-kick", { text: `Your best for ${words}` }),
      h("div.p-head", {}, h("b", {}, cur ? String(cur.w) : "–", h("u", { text: " W" })), cur && h("span", { text: `${f1n(cur.w / P().weight)} W/kg` }), up != null && h("span.p-gain" + (up < 0 ? ".down" : ""), { text: signedW(up) })),
      h("small.p-when", { text: cur ? `Set ${dayShort(cur.start)}: ${cur.name}` : "Not in this range" }),
      chart,
      h("div.p-lens", { role: "group", "aria-label": "Length" }, G.LENGTHS.map(([, l], i) => h("button" + (i === idx ? ".on" : ""), { type: "button", "aria-pressed": String(i === idx), onclick: () => { S.plen = i; Sheet.redraw(); } }, l))),
      h("div.p-legend", {}, h("span", {}, h("i.now"), `Since ${monthOf(from)}`), h("span", {}, h("i.was"), "The range before"))),
    section("Records", h("div.p-records", {}, G.LENGTHS.filter(([t]) => all[t]).map(([t, , w]) => { const r = all[t], was = old[t], fresh = r.start >= addDays(TODAY, -14) && was && was.w < r.w;
      return h("button.p-record" + (fresh ? ".new" : ""), { type: "button", onclick: () => { const a = S.own.find((x) => x.id === r.id); if (a) openAct(a); } },
        fresh && h("span.p-new", { text: "New" }), icon("medal", 26, 2), h("small", { text: w.replace(/^an /, "1 ") }), h("b", { text: `${r.w} W` }), h("small.d", { text: `${f1n(r.w / P().weight)} W/kg · ${dayShort(r.start)}` })); }))),
    rt && section("What kind of rider", h("div.card.glass.p-rider", {}, svgOf(radarSvg(rt.scores)), h("span.tx", {}, h("b", { text: rt.name }), h("span", { text: rt.said })))),
  ] };
}
function radarSvg(s) {
  const c = 70, R = 54, v = (x) => Math.max(0.2, Math.min(1, x / 1.3)) * R;
  const pts = [[c, c - v(s.sprint)], [c + v(s.five), c], [c, c + v(s.ftp)], [c - v(s.minute), c]].map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  const ring = (k) => `${c},${c - R * k} ${c + R * k},${c} ${c},${c + R * k} ${c - R * k},${c}`;
  return `<svg class="p-radar" width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Your strengths: sprint, 5 minutes, FTP and 1 minute"><defs><linearGradient id="prd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cf0" stop-opacity="0.55"/><stop offset="1" stop-color="#2f7af0" stop-opacity="0.35"/></linearGradient></defs>
    <g class="grid"><polygon points="${ring(1)}"/><polygon points="${ring(0.66)}"/><polygon points="${ring(0.33)}"/><line x1="${c}" y1="${c - R}" x2="${c}" y2="${c + R}"/><line x1="${c - R}" y1="${c}" x2="${c + R}" y2="${c}"/></g>
    <polygon points="${pts}" fill="url(#prd)" class="shape"/>
    <text x="${c}" y="10" text-anchor="middle">Sprint</text><text x="138" y="${c + 3}" text-anchor="end">5 min</text><text x="${c}" y="138" text-anchor="middle">FTP</text><text x="2" y="${c + 3}">1 min</text></svg>`;
}

// Training: week by week, how much and how hard; consistency; this month's mix; month by month
function trainingView() {
  const acts = progActs(), wk = G.weekly(acts, TODAY, 26), first4 = wk.slice(0, 4), last4 = wk.slice(-5, -1);
  const avg = (ws) => ws.reduce((a, w) => a + w.secs, 0) / Math.max(1, ws.length), d = avg(last4) - avg(first4), all = avg(wk);
  // (the scale in whole steps of an hour or so, two or three lines up the chart)
  const peak = Math.max(3600, ...wk.map((w) => w.secs)), step = [1800, 3600, 7200, 10800, 18000, 36000].find((x) => peak / x <= 3) || 36000, max = Math.ceil(peak / step) * step;
  const grid = Array.from({ length: max / step }, (_, k) => (k + 1) * step).map((v) => h("span.p-wgrid", { vars: { "--y": (v / max) * 100 + "%" } }, h("u", { text: `${Math.floor(v / 3600) || ""}${v % 3600 ? "½" : ""} h` })));
  const bars = wk.map((w, i) => h("span.p-wbar" + (i === wk.length - 1 ? ".now" : "") + (w.secs ? "" : ".off"), { title: `${dayShort(w.mon)}: ${dur(w.secs)}` },
    w.secs > 0 && h("span.p-wcol", { vars: { "--h": (w.secs / max) * 100 + "%" } }, ["hard", "mid", "easy", "unknown"].map((k) => w[k] > 0 && h("i." + k, { vars: { "--f": w[k] / w.secs } })))));
  // (each month's name under its first week)
  const monthsUnder = wk.map((w, i) => { const m = new Date(w.mon).getMonth(); const starts = i === 0 ? new Date(wk[2].mon).getMonth() === m : new Date(wk[i - 1].mon).getMonth() !== m;   // (the first, only if its month has a few weeks still to run: else it'd sit on the next)
    return h("span", { text: starts ? monthOf(w.mon, "short") : "" }); });
  const st = G.streak(G.weekly(acts, TODAY, 52)), it = G.intensity(acts, addDays(TODAY, -30));
  // (Rhythm's sessions, from when it began: how many done)
  const r = rhythmOn() ? rh() : null, pd = r ? r.days.filter((x) => x.date < TODAY && x.id && x.date >= (S.rhythm.at || 0)) : [], dn = pd.filter((x) => x.done).length;
  const months = [2, 1, 0].map((k) => { const dt = new Date(TODAY); dt.setDate(1); dt.setMonth(dt.getMonth() - k); const s = dt.getTime(), e = new Date(dt.getFullYear(), dt.getMonth() + 1, 1).getTime(), xs = acts.filter((a) => a.start >= s && a.start < e);
    return { name: monthOf(s, "short"), now: k === 0, secs: xs.reduce((a, x) => a + (x.sum.moving || 0), 0), dist: xs.reduce((a, x) => a + (x.sum.dist || 0), 0), n: xs.length }; });
  const mMax = Math.max(1, ...months.map((m) => m.secs));
  const donut = it && svgOf((() => { const R = 48, C = 2 * Math.PI * R, seg = (f, off, cls) => `<circle cx="62" cy="62" r="${R}" class="${cls}" stroke-dasharray="${(f * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off * C).toFixed(1)}" transform="rotate(-90 62 62)"/>`;
    return `<svg class="p-donut" width="124" height="124" viewBox="0 0 124 124" role="img" aria-label="${Math.round(it.easy * 100)}% easy, ${Math.round(it.mid * 100)}% in between, ${Math.round(it.hard * 100)}% hard">${seg(it.easy, 0, "easy")}${seg(it.mid, it.easy, "mid")}${seg(it.hard, it.easy + it.mid, "hard")}<text x="62" y="60" text-anchor="middle" class="big">${Math.round(it.easy * 100)}%</text><text x="62" y="78" text-anchor="middle" class="sm">easy</text></svg>`; })());
  return { title: "Training", body: [
    h("div.card.glass.p-train", {},
      h("div.p-train-head", {}, h("span", {}, h("small.p-kick", { text: "Hours a week, by zone" }), h("b", {}, dur(all), h("u", { text: " on average" }))), Math.abs(d) >= 600 && h("span.p-gain" + (d < 0 ? ".down" : ""), { text: `${d > 0 ? "+" : "−"}${dur(Math.abs(d))} since ${monthOf(wk[0].mon, "short")}` })),
      h("div.p-wchart", {}, h("div.p-wbars", { role: "img", "aria-label": `26 weeks of hours, each split into easy, in between and hard; ${dur(all)} a week on average` }, grid,
        all > 0 && h("span.p-wavg", { vars: { "--y": (all / max) * 100 + "%" } }, h("u", { text: "avg" })), bars), h("div.p-wmonths", { "aria-hidden": "true" }, monthsUnder)),
      h("div.p-legend", {}, h("span", {}, h("i.easy"), "Easy"), h("span", {}, h("i.mid"), "In between"), h("span", {}, h("i.hard"), "Hard"), wk.some((w) => w.unknown) && h("span", {}, h("i.unknown"), "No zones"))),
    h("div.p-pair", {},
      pd.length >= 4 && h("div.p-mini.green", {}, svgOf(ringSvg(dn / pd.length, `${Math.round((dn / pd.length) * 100)}%`, "done")), h("b", { text: "Sessions done" }), h("small", { text: `${dn} of Rhythm’s ${pd.length} since it began.` })),
      h("div.p-mini.orange", {}, h("span.p-steps", { "aria-hidden": "true" }, Array.from({ length: 7 }, (_, i) => h("i", { vars: { "--h": 30 + i * 10 + "%", "--o": i < Math.min(7, st.now) ? 1 : 0.25 } }))),
        h("b", { text: st.now ? `${plural(st.now, "week")} in a row` : "A fresh start" }), h("small", { text: st.now ? `Riding twice a week or more.${st.best > st.now ? ` Your best run: ${st.best}.` : ""}` : "Two rides this week starts a run." }))),
    it && section("How hard, this month", h("div.card.glass.p-mix", {}, donut, h("span.tx", {},
      [["easy", "Easy", it.easy], ["mid", "In between", it.mid], ["hard", "Hard", it.hard]].map(([c, l, v]) => h("span.p-key", {}, h("i." + c), h("span", { text: l }), h("b", { text: `${Math.round(v * 100)}%` }))),
      h("small", { text: it.mid >= 0.2 ? "A lot in the grey middle: easy days easier, hard days harder." : "Mostly easy, hard when it counts: the mix riders improve fastest on." })))),
    section("By month", h("div.p-months", {}, months.map((m) => h("div.p-month" + (m.now ? ".now" : ""), {}, h("small", { text: m.now ? `${m.name} · so far` : m.name }), h("b", { text: hm(m.secs) }),
      h("small", { text: `${dist(m.dist)} · ${m.n}` }), h("i", { vars: { "--w": (m.secs / mMax) * 100 + "%" } }))))),
  ] };
}

// Engine: FTP over the range, aerobic efficiency, and staying power
function engineView() {
  const days = pRange(), from = addDays(TODAY, -days), acts = progActs(), ftp0 = ftpOn(from), d = P().ftp - ftp0;
  const log = [[from, ftp0, 0], ...(P().ftpLog || []).filter((x) => x[0] > from), [TODAY, P().ftp, isSet("ftp") ? 1 : 0]];
  const W = sheetW(), H = 140, B = 20, span = Math.max(DAY, TODAY - from), vs = log.map((x) => x[1]), lo = Math.min(...vs) - 6, hi = Math.max(...vs) + 6;
  const x = (t) => 4 + ((t - from) / span) * (W - 8), y = (v) => H - B - ((v - lo) / (hi - lo)) * (H - B - 16);
  let path = `M${x(from).toFixed(1)} ${y(log[0][1]).toFixed(1)}`;
  for (let i = 1; i < log.length; i++) path += `H${x(log[i][0]).toFixed(1)}V${y(log[i][1]).toFixed(1)}`;
  const dots = log.slice(1, -1).map((p) => `<circle cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="4.5" class="${p[2] ? "set" : "est"}"/>`).join("");
  const ftpChart = svgOf(`<svg class="p-ftp" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="FTP over the range, from ${ftp0} to ${P().ftp} W">
    <defs><linearGradient id="pff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f6cf0" stop-opacity="0.35"/><stop offset="1" stop-color="#6f6cf0" stop-opacity="0"/></linearGradient></defs>
    <path d="${path}H${(W - 4).toFixed(1)}V${H - B}H${x(from).toFixed(1)}Z" fill="url(#pff)"/><path d="${path}H${(W - 4).toFixed(1)}" class="ln"/>${dots}
    <text x="4" y="${H - 4}" class="lab">${monthOf(from, "short")}</text><text x="${W - 4}" y="${H - 4}" text-anchor="end" class="lab">Now</text></svg>`);
  // efficiency: each steady ride a dot, deeper as it's more recent; the line through them, and its usual spread
  const e = G.efficiency(acts, from);
  let effChart = null;
  if (e.enough) {
    const efs = e.pts.map((p) => p.ef), elo = Math.min(...efs) * 0.97, ehi = Math.max(...efs) * 1.03, ex = (t) => 6 + ((t - from) / span) * (W - 12), ey = (v) => 130 - 16 - ((v - elo) / (ehi - elo)) * 100;
    const res = Math.sqrt(e.pts.reduce((a, p) => a + (p.ef - e.line.at(p.t)) ** 2, 0) / e.pts.length), t0 = e.pts[0].t, t1 = e.pts.at(-1).t;
    effChart = svgOf(`<svg class="p-eff" width="${W}" height="130" viewBox="0 0 ${W} 130" role="img" aria-label="Watts per heartbeat on each steady ride, ${e.watts >= 0 ? "rising" : "falling"}">
      <path d="M${ex(t0).toFixed(1)} ${ey(e.line.at(t0) + res).toFixed(1)}L${ex(t1).toFixed(1)} ${ey(e.line.at(t1) + res).toFixed(1)}L${ex(t1).toFixed(1)} ${ey(e.line.at(t1) - res).toFixed(1)}L${ex(t0).toFixed(1)} ${ey(e.line.at(t0) - res).toFixed(1)}Z" class="band"/>
      <path d="M${ex(t0).toFixed(1)} ${ey(e.line.at(t0)).toFixed(1)}L${ex(t1).toFixed(1)} ${ey(e.line.at(t1)).toFixed(1)}" class="trend"/>
      ${e.pts.map((p, i) => `<circle cx="${ex(p.t).toFixed(1)}" cy="${ey(p.ef).toFixed(1)}" r="${i === e.pts.length - 1 ? 6 : 4.5}" class="${i === e.pts.length - 1 ? "last" : "pt"}" fill-opacity="${(0.35 + 0.65 * (i / Math.max(1, e.pts.length - 1))).toFixed(2)}"/>`).join("")}
      <text x="6" y="126" class="lab">${monthOf(from, "short")}</text><text x="${W - 6}" y="126" text-anchor="end" class="lab">${dayShort(t1)}</text></svg>`);
  }
  const b20 = G.bests(acts, from)[1200]?.w, sp = G.stayingPower(acts, from, b20);
  const gauge = sp.drift && svgOf((() => { const v = Math.max(0, Math.min(12, sp.drift.now)), a = Math.PI * (1 - v / 12), nx = 70 + Math.cos(a) * 44, ny = 74 - Math.sin(a) * 44;
    return `<svg class="p-gauge" width="140" height="84" viewBox="0 0 140 84" role="img" aria-label="Heart rate drift ${f1n(sp.drift.now)}%"><defs><linearGradient id="pgg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1fa75a"/><stop offset="0.5" stop-color="#e9b52a"/><stop offset="1" stop-color="#e5372c"/></linearGradient></defs><path d="M14 74 A56 56 0 0 1 126 74" fill="none" stroke="url(#pgg)" stroke-width="12" stroke-linecap="round"/><line x1="70" y1="74" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" class="needle"/><circle cx="70" cy="74" r="6" class="hub"/></svg>`; })());
  const arc = sp.ofFresh && svgOf((() => { const f = Math.max(0, Math.min(1, sp.ofFresh)), a = Math.PI * (1 - f), ex2 = 70 + Math.cos(a) * 56, ey2 = 74 - Math.sin(a) * 56;
    return `<svg class="p-arc" width="140" height="84" viewBox="0 0 140 84" role="img" aria-label="${Math.round(f * 100)}% of fresh"><path d="M14 74 A56 56 0 0 1 126 74" class="bg"/><path d="M14 74 A56 56 0 0 1 ${ex2.toFixed(1)} ${ey2.toFixed(1)}" class="fg"/><text x="70" y="70" text-anchor="middle">${Math.round(f * 100)}%</text></svg>`; })());
  return { title: "Engine", body: [
    h("div.card.p-ftpcard", {}, h("small.p-kick", { text: "FTP" }),
      h("div.p-head", {}, h("b", {}, String(P().ftp), h("u", { text: " W" })), h("span", { text: `${f1n(P().ftp / P().weight)} W/kg` }), d !== 0 && h("span.p-gain" + (d < 0 ? ".down" : ""), { text: signedW(d) })),
      ftpChart, h("small.p-when", { text: (P().ftpLog || []).length ? "Each step a change: a filled dot worked out from your rides, an open one set by you." : "Its history starts now: each change from here is a step." })),
    h("div.card.glass.p-effcard", {}, h("div.p-row", {}, h("small.p-kick", { text: "Aerobic efficiency" }), e.enough && Math.abs(e.pct) >= 1 && h("span.p-gain" + (e.pct < 0 ? ".down" : ""), { text: `${e.pct > 0 ? "+" : "−"}${Math.abs(Math.round(e.pct))}%` })),
      h("b.p-title", { text: e.enough ? (e.watts > 0 ? `${e.watts} W more at ${e.hr} bpm than in ${monthOf(e.pts[0].t)}` : e.watts < 0 ? `${-e.watts} W less at ${e.hr} bpm than in ${monthOf(e.pts[0].t)}` : `Level at ${e.hr} bpm`) : "Needs a few more steady rides" }),
      effChart, h("small.p-when", { text: e.enough ? "Normalized power over heart rate, on each steady ride. Rising: your heart does less for the same work." : "Four or more rides of 45 minutes and longer, with power and heart rate, at an easy pace." })),
    h("div.card.glass.p-stay", {}, h("small.p-kick", { text: "Staying power" }),
      (gauge || arc) ? h("div.p-dials", {},
        gauge && h("div", {}, gauge, h("b", { text: `${f1n(sp.drift.now)}%` }), h("small", { text: `Heart rate drift, long rides${sp.drift.was != null && sp.drift.n >= 4 ? ` · from ${f1n(sp.drift.was)}%` : ""}` })),
        arc && h("div", {}, arc, h("b", { text: `${sp.late20} W` }), h("small", { text: "Best 20 min after 2 hours" }))) : null,
      h("small.p-when", { text: gauge || arc ? "How little you fade late in a long ride: what the long rides and fuelling build. Under 5% drift is a well-built base." : "Shows once you’ve a ride of 90 minutes or more with power and heart rate." })),
  ] };
}

export { progActs, progressView };
