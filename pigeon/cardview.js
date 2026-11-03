// Send to a friend: how Chat draws a card in a letter, and the requests, invites and answers that come with one.
// Today's card frame and wording (InFlite Today's tcard: a head, the figure, a line), drawn by Chat itself: a head with
// a coloured dot ("Weather · North Walsham"), "When sent" beside "Now", a line saying what's changed, and a foot.
// Every function returns HTML, with everything in it escaped, and never throws on anything pigeon/cards.js's norm
// functions let through (a bad zone falls back to the viewer's). Looks: pigeon/cards.css (classes cd-…).
// data-act names here that Chat handles (data-id: the letter's id): askshow, asksend, askno, planans (+data-a),
// planlater (+data-t), cardrm; and for a time to talk (Today First): whenans (+data-a, and data-t for another of its
// times said yes to), whenlater.
import { normCard, normPlan, normAns, normWhen, compareNow, clockIn, dayWords, dayKeyWords, doneFigures, pctText, codeLabel, durWords, liveKey, bigOf, zoneOk, andList } from "./cards.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const HOUR = 3600e3, DAY = 24 * HOUR;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const fin = Number.isFinite;
const safe = (f) => (...a) => { try { return f(...a); } catch (_) { return ""; } };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KIND_NAME = { weather: "Weather", fitness: "Fitness", markets: "Markets", streak: "Chat" };
const SPORT_NOUN = { ride: "ride", run: "run", swim: "swim", walk: "walk", row: "row", strength: "session" };

/* ---------- glyphs: sun, moon, cloud, rain, snow, thunder ---------- */
const svg = (d) => `<svg class="cd-glyph" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const G = {
  sun: svg('<circle cx="12" cy="12" r="4.2" class="cd-g-sun"/><path class="cd-g-line" d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  moon: svg('<path class="cd-g-moon" d="M15.5 3.5a8.5 8.5 0 1 0 5 13.9A7 7 0 0 1 15.5 3.5z"/>'),
  cloud: svg('<path class="cd-g-cloud" d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 18.5z"/>'),
  rain: svg('<path class="cd-g-cloud" d="M7 14.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 14.5z"/><path class="cd-g-rain" d="M8.5 17l-1 3M12.5 17l-1 3M16.5 17l-1 3"/>'),
  snow: svg('<path class="cd-g-cloud" d="M7 14.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 14.5z"/><path class="cd-g-snow" d="M8 18.5h.01M12 20h.01M16 18.5h.01"/>'),
  thunder: svg('<path class="cd-g-cloud" d="M7 14.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 14.5z"/><path class="cd-g-bolt" d="M12.5 13.5l-2.5 4h3l-1.5 4"/>'),
};
function glyph(code, isDay) {
  const l = codeLabel(code);
  if (!l) return "";                       // (no code, or one we don't know: no glyph, and no line)
  if (l === "Clear" || l === "Mostly clear") return isDay === false ? G.moon : G.sun;
  if (l === "Drizzle" || l === "Rain" || l === "Heavy rain" || l === "Showers") return G.rain;
  if (l === "Snow") return G.snow;
  if (l === "Thunder") return G.thunder;
  return G.cloud;
}

/* ---------- pieces ---------- */
const tzOr = (tz, fb) => (zoneOk(tz) ? tz : zoneOk(fb) ? fb : undefined);
const dateOf = (ms, tz) => { if (!fin(ms)) return ""; const k = new Intl.DateTimeFormat("en-CA", { timeZone: tzOr(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); return dayKeyWords(k.slice(0, 10)); };
const keyIn = (ms, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tzOr(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)).slice(0, 10);
const isReal = (now) => isObj(now) && !now.quiet && !now.gone;
// the market a symbol trades on, from its suffix
function market(sym) {
  if (!sym) return "The whole portfolio";
  if (/=X$/.test(sym)) return "Currencies"; if (/-USD$/.test(sym)) return "Crypto"; if (/^\^/.test(sym)) return "Index";
  const m = /\.([A-Z]+)$/.exec(sym)?.[1];
  return { L: "London", AS: "Amsterdam", PA: "Paris", DE: "Frankfurt", F: "Frankfurt", MI: "Milan", MC: "Madrid", SW: "Zurich", TO: "Toronto", AX: "Sydney", HK: "Hong Kong", T: "Tokyo", IR: "Dublin", ST: "Stockholm", CO: "Copenhagen", OL: "Oslo", BR: "Brussels", LS: "Lisbon" }[m] || (m ? "" : "New York");
}
// (the weather where a friend is, made for them: "Where Leo is" on the phone that sent it, "Where you are" on theirs;
// who: that friend's first name, as the chat has it)
const thereTitle = ({ mine, who }) => (mine ? (who ? `Where ${who} is` : "Where they are") : "Where you are");
function head(card, { viewAt, tz, mine = false, who = "" }) {
  const s = card.snap;
  const what = card.kind === "weather" ? s.place : card.kind === "fitness" ? (keyIn(viewAt, tzOr(s.tz, tz)) === s.day ? "Today" : dayKeyWords(s.day)) : card.kind === "markets" ? s.name : "Flight streak";
  const app = card.kind === "weather" && card.there ? thereTitle({ mine, who }) : KIND_NAME[card.kind];
  return `<div class="cd-head"><i class="cd-dot" aria-hidden="true"></i><span class="cd-app">${esc(app)}</span><span class="cd-what"> · ${esc(what)}</span></div>`;
}
// (a ride planned with friends: "with Leo", "with Leo and Ade")
const withLine = (s) => (Array.isArray(s.with) && s.with.length ? `with ${andList(s.with)}` : "");
// the snapshot, as it reads at the moment it's viewed → { big, line, glyph, cls }. answered: there's a real "Now" beside
// it, so the snapshot is said as it was when sent; without one, a rain time gone by reads "Rain was due"
function asSent(card, { viewAt, answered, tz }) {
  const s = card.snap, z = tzOr(s.tz, tz);
  if (card.kind === "weather") {
    const r = s.rain;
    const line = r?.now ? "Raining" : fin(r?.at) ? (r.at > viewAt || answered ? `Rain due ${clockIn(r.at, z)}` : `Rain was due ${clockIn(r.at, z)}`) : codeLabel(s.code);
    return { big: bigOf(card), line, glyph: glyph(s.code, s.isDay) };
  }
  if (card.kind === "fitness") {
    if (s.done) return { big: "Done ✓", line: [doneFigures(s.done), withLine(s)].filter(Boolean).join(" · "), cls: "cd-done" };
    const best = s.best ? `best ${clockIn(s.best.start, z)}–${clockIn(s.best.end, z)}${s.best.dry ? ", dry" : ""}` : "";
    return { big: s.name, line: [fin(s.secs) && s.secs ? durWords(s.secs) : "", best, withLine(s)].filter(Boolean).join(" · "), cls: "cd-name" };
  }
  if (card.kind === "markets") return { big: pctText(s.pct), line: market(s.sym), cls: s.pct > 0 ? "cd-up" : s.pct < 0 ? "cd-down" : "" };
  return { big: bigOf(card), line: fin(s.best) ? `Best ${s.best}` : "" };
}
// what's true now (card-now's answer) → { big, line, glyph, cls }
function asNow(card, now, cmp, viewAt, tz) {
  const s = card.snap, z = tzOr(s.tz, tz);
  if (card.kind === "weather") {
    const r = now.rain;
    return { big: cmp.big[1], line: r?.now ? "Raining" : fin(r?.at) ? `Rain due ${clockIn(r.at, z)}` : codeLabel(now.code), glyph: fin(now.code) ? glyph(now.code, now.isDay) : "" };
  }
  // (done when sent but not seen now, e.g. Fitness can't see it yet: still done, as it was sent)
  if (card.kind === "fitness") return now.done || s.done ? { big: "Done ✓", line: doneFigures(now.done ? now : s.done), cls: "cd-done" } : { big: s.name, line: cmp.line.replace(/\.$/, ""), cls: "cd-name" };
  if (card.kind === "markets") return { big: cmp.big[1], line: now.stale && fin(now.at) ? `Prices from ${clockIn(now.at, tz)}` : market(s.sym), cls: now.pct > 0 ? "cd-up" : now.pct < 0 ? "cd-down" : "" };
  return { big: cmp.big[1], line: "" };
}
const col = (label, x) => `<div class="cd-col"><small class="cd-lab">${esc(label)}</small><div class="cd-fig">${x.glyph || ""}<b class="cd-big ${x.cls || ""}">${esc(x.big)}</b></div>${x.line ? `<span class="cd-line">${esc(x.line)}</span>` : ""}</div>`;
const httpOrigin = (o) => (typeof o === "string" && /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(o) ? o.replace(/\/$/, "") : null);
// "Open in Weather" (the square, never the exact place) or "Open in Markets"; built here, never taken from a card
function footLink(card, links) {
  if (card.kind === "weather" && card.ref?.cell) {
    const o = httpOrigin(links?.weather); if (!o) return "";
    const q = new URLSearchParams({ lat: card.ref.cell[0].toFixed(2), lon: card.ref.cell[1].toFixed(2), name: card.snap.place });
    return `<a class="cd-open" href="${esc(`${o}/?${q}`)}" target="_blank" rel="noopener">Open in Weather</a>`;
  }
  if (card.kind === "markets" && card.ref?.sym) {
    const o = httpOrigin(links?.finance); if (!o) return "";
    return `<a class="cd-open" href="${esc(`${o}/#s=${encodeURIComponent(card.ref.sym)}`)}" target="_blank" rel="noopener">Open in Markets</a>`;
  }
  return "";
}

/* ---------- a card in a letter ---------- */
// now: card-now's answer, null or "wait" (not in yet); live: isLive(); sentAt: the letter's time (if the card has none);
// who: the friend's first name (for the weather where they are: "Where Leo is")
export const cardHtml = safe(function cardHtml(raw, { now = null, viewAt = Date.now(), sentAt, live = false, mine = false, links, tz, who = "" } = {}) {
  const card = normCard(raw);              // (checked again here, so nothing unchecked is ever drawn)
  if (!card) return "";
  if (isObj(now) && now.gone) live = false;          // (a Fitness share past its time: "When sent" only)
  const at = fin(card.at) ? card.at : fin(sentAt) ? sentAt : null;
  const sentLabel = at != null ? `When sent · ${clockIn(at, tz)}` : "When sent";
  const cmp = live ? compareNow(card, isReal(now) ? now : null, viewAt) : null, real = !!(live && isReal(now) && cmp.delta);
  const was = asSent(card, { viewAt, answered: real, tz });
  let body, after = "";
  if (live) {
    const nowCol = real ? col(`Now · ${clockIn(fin(now.at) ? Math.min(now.at, viewAt) : viewAt, tz)}`, asNow(card, now, cmp, viewAt, tz)) : col("Now", { big: "…", line: "" });
    body = `<div class="cd-cols">${col(sentLabel, was)}${nowCol}</div>`;
    if (real) after = `${cmp.line && card.kind !== "fitness" ? `<p class="cd-said">${esc(cmp.line)}</p>` : ""}<div class="cd-delta${cmp.changed ? " cd-changed" : ""}">${esc(cmp.delta)}</div>`;
  } else body = `<div class="cd-cols cd-one">${col(sentLabel, was)}</div>`;
  const gone = !live && liveKey(card) && at != null ? `<span class="cd-sent">Sent ${esc(dateOf(at, tz))}</span>` : "";
  const link = footLink(card, links);
  const foot = link || gone ? `<div class="cd-foot">${gone}${link}</div>` : "";
  return `<div class="cd-card cd-k-${card.kind}${mine ? " cd-mine" : ""}">${head(card, { viewAt, tz, mine, who })}${body}${after}${foot}</div>`;
});

// The card in the share sheet (and the "Send Yours Back?" sheet), as it would go: no "When sent" yet (who: the friend
// a card of where they are is for)
export const sheetCardHtml = safe(function sheetCardHtml(raw, { now = null, viewAt = Date.now(), links, tz, who = "" } = {}) {
  const card = normCard(raw);
  if (!card) return "";
  const x = asSent(card, { viewAt, answered: false, tz });
  const cmp = isReal(now) ? compareNow(card, now, viewAt) : null;
  // (where Chat's own look now says otherwise, said as now, with its time, apart from the card and words that go)
  const nowSaid = cmp?.changed && cmp.line ? `<p class="cd-said cd-nowsaid"><span class="cd-delta cd-changed">Now · ${esc(clockIn(fin(now.at) ? Math.min(now.at, viewAt) : viewAt, tz))}</span> ${esc(cmp.line)}</p>` : "";
  const fig = `<div class="cd-fig">${x.glyph || ""}<b class="cd-big ${x.cls || ""}">${esc(x.big)}</b></div>${x.line ? `<span class="cd-line">${esc(x.line)}</span>` : ""}`;
  const link = footLink(card, links);
  return `<div class="cd-card cd-sheet cd-k-${card.kind}">${head(card, { viewAt, tz, mine: true, who })}<div class="cd-cols cd-one"><div class="cd-col">${fig}</div></div>${card.say ? `<p class="cd-say">${esc(card.say)}</p>` : ""}${nowSaid}${link ? `<div class="cd-foot">${link}</div>` : ""}</div>`;
});

/* ---------- "How’s yours?" ---------- */
// under a card that asks: yours "You asked how theirs is"; theirs by state: open, declined ("Not Now"), sent
export const askHtml = safe(function askHtml(ask, { mine = false, who = "", state = "open", id = "" } = {}) {
  if (!isObj(ask) || !["weather", "fitness", "markets"].includes(ask.kind)) return "";
  if (mine) return `<div class="cd-ask"><span>You asked how theirs is</span></div>`;
  if (state === "sent") return `<div class="cd-ask cd-done"><span>You sent yours back</span></div>`;
  const declined = state === "declined";
  return `<div class="cd-ask"><span>${esc(declined ? "You didn’t send yours" : `${who || "Your friend"} asks how yours is`)}</span><button type="button" class="cd-btn" data-act="askshow" data-id="${esc(id)}">${declined ? "Send Yours After All" : "Show What Would Go"}</button></div>`;
});

/* ---------- side by side: yours and theirs ---------- */
// mineCard: the viewer's own (left, "You"); theirCard: the friend's (right, their first name)
export const sideBySideHtml = safe(function sideBySideHtml(mineCard, theirCard, { nowMine = null, nowTheirs = null, who = "", viewAt = Date.now(), tz } = {}) {
  const a = normCard(mineCard), b = normCard(theirCard);
  if (!a || !b) return "";
  const kind = a.kind === b.kind ? a.kind : null;
  const side = (card, now, name) => {
    const s = card.snap, real = isReal(now);
    if (card.kind === "weather") {
      const temp = real && fin(now.temp) ? now.temp : s.temp, code = real && fin(now.code) ? now.code : s.code, day = real && typeof now.isDay === "boolean" ? now.isDay : s.isDay;
      return { name, big: fin(temp) ? `${Math.round(temp)}°` : "–", line: codeLabel(code), glyph: glyph(code, day), sub: s.place };
    }
    if (card.kind === "fitness") {
      const done = real && now.done ? now : s.done ? s.done : null;
      if (!done) return { name, big: s.name, line: "Not done yet", done: false };
      const m = fin(done.secs) ? Math.round(done.secs / 60) : null;
      const big = m != null ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : "Done ✓";
      return { name, big, line: fin(done.dist) ? `${(done.dist / 1000).toFixed(1)} km ${SPORT_NOUN[s.sport] || ""}`.trim() : SPORT_NOUN[s.sport] || "", done: true };
    }
    if (card.kind === "markets") { const p = real && fin(now.pct) ? now.pct : s.pct; return { name, big: pctText(p), line: s.name, cls: p > 0 ? "cd-up" : p < 0 ? "cd-down" : "" }; }
    return { name, big: bigOf(card), line: "" };
  };
  const L = side(a, nowMine, "You"), R = side(b, nowTheirs, who || "Them");
  const title = kind === "weather" ? "Here and there · now" : kind === "fitness" ? "Today’s sessions" : kind === "markets" ? "Today’s moves" : "Yours and theirs";
  const cell = (x) => `<div class="cd-col"><small class="cd-lab">${esc(x.name)}</small><div class="cd-fig">${x.glyph || ""}<b class="cd-big ${x.cls || ""}">${esc(x.big)}</b></div>${x.line ? `<span class="cd-line">${esc(x.line)}</span>` : ""}${x.sub ? `<span class="cd-line cd-sub">${esc(x.sub)}</span>` : ""}</div>`;
  const foot = kind === "fitness" && L.done && R.done ? `<div class="cd-delta cd-same">Both done today</div>` : "";
  return `<div class="cd-card cd-sbs cd-k-${kind || a.kind}"><div class="cd-head"><i class="cd-dot" aria-hidden="true"></i><span class="cd-app">${esc(title)}</span></div><div class="cd-cols">${cell(L)}${cell(R)}</div>${foot}</div>`;
});

/* ---------- invites ---------- */
// "10:00–12:00" today, "Tomorrow 10:00–12:00", "Sat 10:00–12:00", "Sat 14 Nov 10:00–12:00"
const spanOf = (start, end, tz, viewAt) => { const d = dayWords(start, tz, viewAt); return `${d === "Today" ? "" : `${/^[A-Z][a-z]+day$/.test(d) ? d.slice(0, 3) : d} `}${clockIn(start, tz)}–${clockIn(end, tz)}`; };
const verbOf = (plan) => (plan?.sport === "run" ? "Run" : "Ride");
// the plan itself: what, when (on the viewer's clock), dry, far
function planBody(plan, { tz, viewAt }) {
  const title = plan.far ? `${verbOf(plan)} at the same time?` : `${verbOf(plan)} together?`;
  return `<div class="cd-head"><i class="cd-dot" aria-hidden="true"></i><span class="cd-app">${esc(title)}</span></div>
    <div class="cd-plan"><b class="cd-big cd-name">${esc(spanOf(plan.start, plan.end, tz, viewAt))}</b><span class="cd-line">${esc(plan.name)}${plan.dry ? " · Dry for both" : ""}</span>${plan.far ? `<span class="cd-line">You’re far apart: same time, each where you are.</span>` : ""}</div>`;
}
const passed = (plan, viewAt) => fin(plan.start) && plan.start < viewAt;
// opts: { showLater: true } draws the other times open (else they wait, hidden, under "Later" for Chat to show)
export const inviteHtml = safe(function inviteHtml(raw, { mine = false, who = "", id = "", canAnswer = true, tz, viewAt = Date.now(), showLater = false } = {}) {
  const plan = normPlan(raw);
  if (!plan) return "";
  let tail = "";
  if (passed(plan, viewAt)) tail = `<p class="cd-said">This time has passed.</p>`;
  else if (mine) tail = who ? `<p class="cd-said">${esc(`You asked ${who}.`)}</p>` : "";
  else if (canAnswer) {
    const ahead = (plan.opts || []).filter((o) => fin(o.start) && o.start >= viewAt);
    const chips = ahead.length ? ahead.map((o) => `<button type="button" class="cd-chip" data-act="planlater" data-id="${esc(id)}" data-t="${esc(o.start)}">${esc(spanOf(o.start, o.end, tz, viewAt).split("–")[0])}</button>`).join("") : `<span class="cd-line">No other time is dry for you both.</span>`;
    tail = `<div class="cd-acts">${["yes", "later", "no"].map((a) => `<button type="button" class="cd-btn${a === "yes" ? " cd-pri" : ""}" data-act="planans" data-a="${a}" data-id="${esc(id)}">${a === "yes" ? "Yes" : a === "later" ? "Later" : "No"}</button>`).join("")}</div><div class="cd-later"${showLater ? "" : " hidden"}>${chips}</div>`;
  }
  return `<div class="cd-card cd-invite cd-k-fitness${mine ? " cd-mine" : ""}">${planBody(plan, { tz, viewAt })}${tail}</div>`;
});

// An answer to an invite: a yes, a no, or a "later" (itself an invite with one time: Yes / No for the one who asked);
// or to a time to talk (whenAnsHtml)
export const answerHtml = safe(function answerHtml(raw, { mine = false, who = "", id = "", canAnswer = true, tz, viewAt = Date.now() } = {}) {
  const ans = normAns(raw);
  if (!ans) return "";
  if (ans.id) return whenAnsHtml(ans, { mine, who, tz, viewAt });
  const name = mine ? "You" : who || "They", p = isObj(ans.plan) ? ans.plan : null;
  const when = p ? (() => { const d = dayWords(p.start, tz, viewAt); return `${d === "Today" ? "" : `${d === "Tomorrow" ? "tomorrow" : d} `}${clockIn(p.start, tz)}`; })() : "";
  if (ans.a === "no" || !p) {
    return `<div class="cd-card cd-answer cd-k-fitness${mine ? " cd-mine" : ""}"><div class="cd-head"><i class="cd-dot" aria-hidden="true"></i><span class="cd-app">${esc(`${name}: Can’t make it this time`)}</span></div>${mine ? "" : `<p class="cd-said">Fitness keeps your plan as it was.</p>`}</div>`;
  }
  if (ans.a === "yes") {
    return `<div class="cd-card cd-answer cd-k-fitness${mine ? " cd-mine" : ""}"><div class="cd-head"><i class="cd-dot" aria-hidden="true"></i><span class="cd-app">${esc(`${name}: Yes, ${when} ✓`)}</span></div><p class="cd-said">${esc(`In Fitness for you both to add${p.dry ? " · dry for both" : ""}`)}</p></div>`;
  }
  // later
  let tail = "";
  if (passed(p, viewAt)) tail = `<p class="cd-said">This time has passed.</p>`;
  else if (!mine && canAnswer) tail = `<div class="cd-acts">${["yes", "no"].map((a) => `<button type="button" class="cd-btn${a === "yes" ? " cd-pri" : ""}" data-act="planans" data-a="${a}" data-id="${esc(id)}">${a === "yes" ? "Yes" : "No"}</button>`).join("")}</div>`;
  return `<div class="cd-card cd-answer cd-invite cd-k-fitness${mine ? " cd-mine" : ""}"><div class="cd-head"><i class="cd-dot" aria-hidden="true"></i><span class="cd-app">${esc(`${name}: Later suits me better`)}</span></div>
    <div class="cd-plan"><b class="cd-big cd-name">${esc(spanOf(p.start, p.end, tz, viewAt))}</b><span class="cd-line">${esc(p.name)}${p.dry ? " · Dry for both" : ""}</span></div>${tail}</div>`;
});

/* ---------- a time to talk (Today First) ---------- */
// "Call at 18:30?", "Meet tomorrow at 10:00?", "Call Saturday at 18:30?", "Call on Sat 14 Nov at 18:30?" (the viewer's clock)
const verbWhen = (w) => (w.kind === "meet" ? "Meet" : "Call");
const atOf = (ms, tz, viewAt) => { const d = dayWords(ms, tz, viewAt); return `${d === "Today" ? "" : d === "Tomorrow" ? "tomorrow " : /^[A-Z][a-z]+day$/.test(d) ? `${d} ` : `on ${d} `}at ${clockIn(ms, tz)}`; };
const minsWords = (m) => (m % 60 ? durWords(m * 60) : `${m / 60} hour${m === 60 ? "" : "s"}`);
// The invite: when (on the viewer's clock), how long, Yes · Another Time · No for the friend, the other times offered
// as chips under Another Time (shown with showLater), "You asked Leo." on your own, and once every time has passed,
// said so with nothing to answer. Yes goes to the first time while it's ahead; a chip says yes to its own (data-t).
export const whenHtml = safe(function whenHtml(raw, { mine = false, who = "", id = "", canAnswer = true, tz, viewAt = Date.now(), showLater = false } = {}) {
  const w = normWhen(raw);
  if (!w) return "";
  const z = tzOr(tz, w.tz), ahead = w.opts.filter((o) => o >= viewAt), firstAhead = w.start >= viewAt;
  const others = w.opts.length ? `<span class="cd-line">${esc(`Or ${andList(w.opts.map((o) => spanOf(o, o + w.mins * 60e3, z, viewAt).split("–")[0])).replace(/ and ([^ ]+)$/, " or $1")}`)}</span>` : "";
  const body = `<div class="cd-head"><i class="cd-dot" aria-hidden="true"></i><span class="cd-app">${esc(`${verbWhen(w)} ${atOf(w.start, z, viewAt)}?`)}</span></div>
    <div class="cd-plan"><b class="cd-big cd-name">${esc(spanOf(w.start, w.start + w.mins * 60e3, z, viewAt))}</b><span class="cd-line">${esc(minsWords(w.mins))}</span>${others}</div>`;
  let tail = "";
  if (!firstAhead && !ahead.length) tail = `<p class="cd-said">This time has passed.</p>`;
  else if (mine) tail = who ? `<p class="cd-said">${esc(`You asked ${who}.`)}</p>` : "";
  else if (canAnswer) {
    const btn = (a, label) => `<button type="button" class="cd-btn${a === "yes" ? " cd-pri" : ""}" data-act="whenans" data-a="${a}" data-id="${esc(id)}">${label}</button>`;
    const chips = ahead.map((o) => `<button type="button" class="cd-chip" data-act="whenans" data-a="yes" data-id="${esc(id)}" data-t="${esc(o)}">${esc(spanOf(o, o + w.mins * 60e3, z, viewAt).split("–")[0])}</button>`).join("");
    tail = `<div class="cd-acts">${firstAhead ? btn("yes", "Yes") : ""}${btn("later", "Another Time")}${btn("no", "No")}</div>${chips ? `<div class="cd-later"${showLater ? "" : " hidden"}>${chips}</div>` : ""}`;
  }
  return `<div class="cd-card cd-invite cd-when cd-k-streak${mine ? " cd-mine" : ""}">${body}${tail}</div>`;
});
// An answer to one: "Leo: Yes, 18:30 ✓" (In Today for you both), "Leo: Another time", "Leo: Can’t make that time"
const whenAnsHtml = (ans, { mine, who, tz, viewAt }) => {
  const name = mine ? "You" : who || "They";
  const when = fin(ans.start) ? (() => { const d = dayWords(ans.start, tz, viewAt); return `${d === "Today" ? "" : `${d === "Tomorrow" ? "tomorrow" : d} `}${clockIn(ans.start, tz)}`; })() : "";
  const title = ans.a === "yes" ? `${name}: Yes${when ? `, ${when}` : ""} ✓` : ans.a === "later" ? `${name}: Another time${when ? `, ${when}?` : ""}` : `${name}: Can’t make that time`;
  const said = ans.a === "yes" ? `<p class="cd-said">In Today for you both</p>` : "";
  return `<div class="cd-card cd-answer cd-when cd-k-streak${mine ? " cd-mine" : ""}"><div class="cd-head"><i class="cd-dot" aria-hidden="true"></i><span class="cd-app">${esc(title)}</span></div>${said}</div>`;
};

// The plan's strip: "You" and the friend, an hour a cell (dry, wet, or outside the hours), the window marked
export const stripHtml = safe(function stripHtml(hours, { who = "", start, end, tz } = {}) {
  const hs = (Array.isArray(hours) ? hours : []).filter((h) => isObj(h) && fin(h.t)).slice(0, 14);
  if (!hs.length) return "";
  const st = (v) => (v === "dry" || v === "wet" ? v : "off");
  const inWin = (t) => fin(start) && fin(end) && t >= start && t < end;
  const row = (label, key) => `<div class="cd-srow"><span class="cd-slab">${esc(label)}</span>${hs.map((h) => `<i class="cd-cell cd-${st(h[key])}${inWin(h.t) ? " cd-in" : ""}"></i>`).join("")}</div>`;
  const ticks = `<div class="cd-srow cd-ticks"><span class="cd-slab"></span>${hs.map((h, i) => `<i class="cd-tick">${i % 2 ? "" : esc(clockIn(h.t, tz).slice(0, 2))}</i>`).join("")}</div>`;
  const label = hs.map((h) => `${clockIn(h.t, tz)} you ${st(h.me)}, ${who || "them"} ${st(h.them)}`).join("; ");
  return `<div class="cd-strip" role="img" aria-label="${esc(label)}">${ticks}${row("You", "me")}${row(who || "Them", "them")}</div>`;
});
