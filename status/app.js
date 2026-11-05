// status.inflite.ai's page: what /api/status says (functions/_status.js), drawn, and asked again every minute while
// it's on screen. An open row asks for its last 24 hours (/api/status/day). Times in the viewer's own.
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const SAY = { ok: "Working", warn: "Slow", down: "Down", none: "Not checked" };
  const GROUPS = [["apps", "Apps"], ["account", "Your account"], ["jobs", "Behind the scenes"], ["deps", "What they rely on"], ["home", "georgefarrowgreen.com"]];
  const GLYPH = {
    today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.4A8.4 8.4 0 1 1 21 11.5Z"/>',
    weather: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 7.9Z"/>',
    fitness: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/>',
    markets: '<path d="M6 20v-6M12 20V9M18 20V4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    auth: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    home: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    notify: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    wxtick: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
    garmin: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
    mkttick: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    "dep-weather": '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 7.9Z"/>',
    "dep-prices": '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    "dep-garmin": '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
    "dep-email": '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    morning: '<path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4 3 4-3"/>',
  };
  // (each app's own logo, as InFlite's menu shows it, for the app, its job and the home page; what's outside InFlite
  // (the weather provider, prices, Garmin, email sending) keeps a plain glyph)
  const LOGO = { today: "today", morning: "today", chat: "chat", notify: "chat", weather: "weather", wxtick: "weather", fitness: "fitness", garmin: "fitness",
    markets: "markets", mkttick: "markets", mail: "mail", auth: "account", account: "account", home: "home" };
  const icon = (id) => LOGO[id] ? `<span class="ic logo" data-app="${esc(id)}"><img src="icons/${LOGO[id]}.svg" alt="" width="28" height="28" decoding="async"></span>`
    : `<span class="ic" data-app="${esc(id)}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[id] || GLYPH.home}</svg></span>`;
  const CHEV = '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const hm = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dm = (t) => new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
  const dayName = (k) => new Date(`${k}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : dm(t); };
  const and = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
  const len = (ms) => { const m = Math.max(1, Math.round(ms / 60e3)); return m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim(); };
  const STALE = 15 * 60e3;
  let data = null;
  const opened = new Set(), days = new Map();

  // (the last 90 UK days, as the server keeps them: for the bars' dates)
  const ukDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
  function dayKeys(n = 90) { const out = new Set(), t = Date.now(); for (let i = n + 1; i >= 0; i--) out.add(ukDay.format(t - i * 864e5)); return [...out].slice(-n); }

  async function load() {
    try {
      const r = await fetch("/api/status", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(String(r.status));
      data = await r.json(); data.fetched = Date.now();
      draw();
    } catch (_) {
      if (!data) unreachable();
    }
  }
  function unreachable() {
    verdict("warn", "The checks can’t be read just now", "This page couldn’t reach the status checks. Try again in a minute.", '<path d="M12 7v6M12 17h.01"/>');
    $("live").dataset.s = "warn"; $("live").lastElementChild.textContent = "Not reachable";
  }
  function verdict(s, title, sub, glyph) {
    $("verdict").dataset.s = s; $("vtitle").textContent = title; $("vsub").textContent = sub; $("vicon").innerHTML = glyph;
  }

  function draw() {
    const d = data, stale = !d.at || Date.now() - d.at > STALE;
    const late = (j) => j.at && Date.now() - j.at > STALE;
    const jobs = d.jobs.map((j) => ({ ...j, s: j.s === "ok" && late(j) ? "warn" : j.s }));
    const deps = d.deps || [], all = [...d.services, ...jobs, ...deps];
    const down = all.filter((x) => x.s === "down"), slow = all.filter((x) => x.s === "warn");
    // the verdict
    if (!d.at) verdict("none", "Checks starting", "The first checks run within five minutes of this page going up.", '<path d="M12 7v5l3 2"/>');
    else if (stale) verdict("warn", "The checks are running late", `The last check was ${ago(d.at)}. What’s below is from then.`, '<path d="M12 7v5l3 2"/>');
    else if (down.length) verdict("down", `${and(down.map((x) => x.name))} ${down.length > 1 ? "are" : "is"} down`, down.some((x) => x.id === "chat" || x.id === "notify") ? "Messages sent now are kept and go out once it’s back." : "It’s being looked into. Everything else below is as it says.", '<path d="M7 7l10 10M17 7 7 17"/>');
    else if (slow.length) verdict("warn", "A few things are slow", `${and(slow.map((x) => x.name))}: slower than usual or running late. Everything else is normal.`, '<path d="M12 7v6M12 17h.01"/>');
    else verdict("ok", "Everything’s working", `All ${all.length} are answering normally.`, '<path d="m5 12.5 4.5 4.5L19 7.5"/>');
    const live = $("live"); live.dataset.s = !d.at ? "none" : stale ? "warn" : "ok";
    live.lastElementChild.textContent = d.at ? `Live · checked ${hm(d.at)}` : "Checks starting";
    const ups = d.services.filter((s) => s.up90 != null);
    $("vup").textContent = ups.length ? `${(ups.reduce((a, s) => a + s.up90, 0) / ups.length).toFixed(2)}%` : "–";
    $("vupl").textContent = ups.length ? (d.services.some((s) => s.days.filter(Boolean).length >= 90) ? "up, 90 days" : "up since checks began") : "no history yet";
    const lastInc = d.incidents[0];
    $("vfoot").innerHTML = `<span>Checked every <b>${d.every || 5} minutes</b></span>${d.at ? `<span>Next check <b>${hm(d.at + (d.every || 5) * 60e3)}</b></span>` : ""}<span>Last incident <b>${lastInc ? (lastInc.ended ? dm(lastInc.started) : "now") : "none"}</b></span>`
      + (d.outside && Date.now() - d.outside < 3 * 3600e3 ? `<span>Also checked from outside Cloudflare <b>${hm(d.outside)}</b></span>` : "");
    maint(d);
    // the groups
    const box = $("groups"), keys = dayKeys();
    box.textContent = "";
    for (const [g, title] of GROUPS) {
      const items = g === "jobs" ? jobs : g === "deps" ? deps : d.services.filter((s) => s.group === g);
      if (!items.length) continue;
      const sec = document.createElement("section"); sec.className = "group";
      const bad = items.filter((x) => x.s === "down" || x.s === "warn").length;
      sec.innerHTML = `<div class="gh"><h2>${esc(title)}</h2><span>${bad ? `${bad} of ${items.length} affected` : g === "jobs" ? "Scheduled jobs, every 5 minutes" : g === "deps" ? "Outside InFlite, checked every 5 minutes" : items.length > 1 ? `All ${items.length} working` : SAY[items[0].s]}</span></div>`;
      const card = document.createElement("div"); card.className = "card glass";
      if (g === "jobs") {
        card.innerHTML = `<div class="tiles">${items.map((j) => `<div class="tile" data-s="${esc(j.s)}">${icon(j.id)}<b>${esc(j.name)}</b><span class="dot" role="img" aria-label="${esc(SAY[j.s])}" title="${esc(SAY[j.s])}"></span><small class="num">${j.s === "down" ? `Failed at ${hm(j.at)}` : !j.at ? "Not run yet" : late(j) ? `Late · last ran ${ago(j.at)}` : `Every 5 min · ran ${hm(j.at)}`}</small></div>`).join("")}</div>`;
      } else if (g === "deps") {
        card.innerHTML = `<div class="tiles">${items.map((x) => `<div class="tile" data-s="${esc(x.s)}">${icon(x.id)}<b>${esc(x.name)}</b><span class="dot" role="img" aria-label="${esc(SAY[x.s])}" title="${esc(SAY[x.s])}"></span><small class="num">${x.s === "down" ? esc(x.why || "Not answering") : x.s === "warn" ? `Slow · ${x.ms} ms` : x.ms != null ? `Answering · ${x.ms} ms` : "Working"}</small></div>`).join("")}</div>`;
      } else {
        for (const s of items) card.append(row(s, keys));
        card.insertAdjacentHTML("beforeend", `<div class="axis num"><span><span class="n90">${esc(dm(new Date(`${keys[0]}T12:00:00`)))}</span><span class="n45">${esc(dm(new Date(`${keys[45]}T12:00:00`)))}</span></span><span>Today</span></div>`);
      }
      sec.append(card); box.append(sec);
    }
    incidents(d);
    bugs(d);
  }

  function row(s, keys) {
    const el = document.createElement("div"); el.className = "item"; el.dataset.svc = s.id;
    const up = s.up90 == null ? "" : `${s.up90.toFixed(2)}%`;
    // (uptime's period: 90 days once there are, else since the first day checked)
    const first = s.days.findIndex(Boolean), full = first === 0 && s.days.filter(Boolean).length >= 89;
    const since = first < 0 ? "" : full ? "90 days" : `since ${dm(new Date(`${keys[first]}T12:00:00`))}`;
    el.innerHTML = `<div class="row" role="button" tabindex="0" aria-expanded="false" aria-label="${esc(`${s.name}: ${SAY[s.s]}`)}">
        ${icon(s.id)}
        <span class="nm"><b>${esc(s.name)}</b><small>${esc(s.address)}</small></span>
        <span class="right"><span class="up num">${up}</span><span class="state" data-s="${esc(s.s)}">${esc(SAY[s.s])}</span>${CHEV}</span>
        <span class="bars" aria-hidden="true">${s.days.map((d, i) => `<i data-s="${d ? esc(d.s) : "none"}" data-i="${i}"></i>`).join("")}</span>
      </div>
      <div class="more"><div><div class="inner">
        <div class="stats num">
          <div data-s="${esc(s.s)}"><span>Now</span><b>${s.s === "down" ? "No answer" : s.ms != null ? `${s.ms}<small> ms</small>` : esc(SAY[s.s])}</b><em>${s.at ? `at ${esc(hm(s.at))}` : "&nbsp;"}</em></div>
          <div><span>Typical</span><b class="typ">–</b><em class="typw">&nbsp;</em></div>
          <div><span>Uptime</span><b>${up || "–"}</b><em>${since ? esc(since) : "&nbsp;"}</em></div>
        </div>
        ${(s.checks || []).length > 1 ? `<div class="checks num">${s.checks.map((c) => `<div data-s="${esc(c.s)}"><span class="dot"></span><span>${esc(c.k)}</span><em>${c.s === "down" ? esc(c.why || "Failing") : c.at ? `ran ${esc(hm(c.at))}` : c.ms != null ? `${c.ms} ms` : esc(SAY[c.s])}</em></div>`).join("")}</div>` : ""}
        <div class="rt">
          <div class="rt-h"><b>Response time</b><span class="rt-when"></span></div>
          <div class="day"></div>
        </div>
        <p class="meta num">${s.version ? `Version ${esc(s.version)} · ` : ""}${esc(s.address)}</p>
      </div></div></div>`;
    const r = el.querySelector(".row");
    const flip = (open) => { el.classList.toggle("open", open); r.setAttribute("aria-expanded", String(open)); if (open) { opened.add(s.id); chart(el, s); } else opened.delete(s.id); };
    r.addEventListener("click", (e) => { if (!e.target.closest(".bars")) flip(!el.classList.contains("open")); });
    r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(!el.classList.contains("open")); } });
    const bars = r.querySelector(".bars");
    bars.addEventListener("pointermove", (e) => { const i = e.target.dataset?.i; if (i != null) tipAt(e, keys[+i], s.days[+i]); });
    bars.addEventListener("pointerleave", () => ($("tip").hidden = true));
    // (a finger lifted: a touch never leaves, so the day's word goes a moment after)
    for (const k of ["pointerup", "pointercancel"]) bars.addEventListener(k, (e) => { if (e.pointerType !== "mouse") setTimeout(() => ($("tip").hidden = true), 1400); });
    if (opened.has(s.id)) flip(true);
    return el;
  }
  function tipAt(e, key, d) {
    tipShow(e.clientX, e.clientY, `${esc(dayName(key))}<span>${!d ? "Not checked" : d.s === "ok" ? `No problems · ${d.up}%` : d.s === "warn" ? `Slow or briefly down · ${d.up}%` : `Down for a while · ${d.up}%`}</span>`);
  }
  function tipShow(cx, cy, html) {
    const tip = $("tip");
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(innerWidth - w - 12, Math.max(12, cx - w / 2))}px`; tip.style.top = `${Math.max(8, cy - tip.offsetHeight - 14)}px`;
  }

  // An open row's response times: the last 24 hours, or since checks began where that's less, every check a point, and
  // where it didn't answer shaded. Drawn at the width it's shown at; touch or point along it for any moment's
  async function chart(el, s) {
    const box = el.querySelector(".day");
    const have = days.get(s.id);
    if (have && Date.now() - have.got < 60e3) return draw24(el, s, have.d);
    if (!have) box.innerHTML = '<p class="chart-note">Loading…</p>';
    try {
      const r = await fetch(`/api/status/day?svc=${encodeURIComponent(s.id)}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      days.set(s.id, { d, got: Date.now() });
      draw24(el, s, d);
    } catch (_) { if (!have) box.innerHTML = '<p class="chart-note">The response times couldn’t be loaded.</p>'; }
  }
  function draw24(el, s, d) {
    const box = el.querySelector(".day"), when = el.querySelector(".rt-when"), typ = el.querySelector(".typ");
    const pts = d.points.filter((p) => p[1] !== "none"), known = pts.filter((p) => p[2] != null).map((p) => p[2]).sort((a, b) => a - b);
    const mid = known.length ? known[Math.floor(known.length / 2)] : null, worst = known.length ? known[known.length - 1] : null;
    const downs = pts.filter((p) => p[1] === "down").length;
    if (typ) typ.innerHTML = mid != null ? `${mid}<small> ms</small>` : "–";
    const typw = el.querySelector(".typw");
    if (pts.length < 2) { when.textContent = ""; box.innerHTML = '<p class="chart-note">A line appears after a few more checks, every five minutes.</p>'; return; }
    // (the span: the last 24 hours, or from the first check where that's later)
    const to = d.to, from = Math.max(d.from, pts[0][0] - 5 * 60e3), hrs = (to - from) / 3600e3;
    when.textContent = hrs > 23 ? "Last 24 hours" : `Since ${hm(from)}`;
    if (typw) typw.textContent = hrs > 23 ? "last 24 hours" : `since ${hm(from)}`;
    const W = Math.max(260, Math.round(box.clientWidth || 600)), H = 132, T = 18, B = 22, L = 2, R = 6;
    const top = Math.max(100, Math.ceil((worst || 0) * 1.1 / 50) * 50);
    const x = (t) => L + ((t - from) / (to - from)) * (W - L - R), y = (v) => T + (1 - Math.min(v, top) / top) * (H - T - B);
    let line = "", area = "", seg = [], gaps = "";
    const close = () => { if (seg.length > 1) { line += `M${seg.join("L")}`; area += `M${seg[0].split(",")[0]},${y(0)}L${seg.join("L")}L${seg[seg.length - 1].split(",")[0]},${y(0)}Z`; } else if (seg.length === 1) line += `M${seg[0]}l0.1,0`; seg = []; };
    const step = Math.max(2, x(from + 5 * 60e3) - x(from));
    for (const [t, st, ms] of pts) {
      if (st === "down" || ms == null) { close(); if (st === "down") gaps += `<rect class="gap" x="${(x(t) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${H - T - B}" rx="2"/>`; continue; }
      seg.push(`${x(t).toFixed(1)},${y(ms).toFixed(1)}`);
    }
    close();
    const id = `rt-${esc(s.id)}`;
    const grid = [top, top / 2].map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="yl" x="${L + 2}" y="${y(v) - 5}">${v} ms</text>`).join("") + `<line class="base" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    const ticks = [from, from + (to - from) / 2, to].map((t, i) => `<text class="xl" x="${x(t)}" y="${H - 5}" text-anchor="${["start", "middle", "end"][i]}">${i === 2 ? "Now" : esc(hm(t))}</text>`).join("");
    const last = pts[pts.length - 1], end = last[1] !== "down" && last[2] != null ? `<circle class="end" cx="${x(last[0])}" cy="${y(last[2])}" r="3.5"/>` : "";
    box.innerHTML = `<div class="plot"><svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${s.name}: response time, ${when.textContent.toLowerCase()}; typically ${mid ?? "–"} ms`)}">`
      + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g0"/><stop offset="1" class="g1"/></linearGradient></defs>`
      + `${grid}${gaps}<path class="area" fill="url(#${id})" d="${area}"/><path class="line" d="${line}"/>${end}${ticks}`
      + `<line class="cursor" x1="0" x2="0" y1="${T}" y2="${y(0)}" visibility="hidden"/><circle class="cdot" r="4" visibility="hidden"/></svg></div>`
      + `<p class="chart-note num">${[worst != null ? `Slowest ${worst} ms` : "", downs ? `<span class="nd">No answer ${downs}×</span>` : "No missed checks"].filter(Boolean).join(" · ")}</p>`;
    // (any moment's: the nearest check to where you touch or point)
    const svgEl = box.querySelector("svg"), cur = svgEl.querySelector(".cursor"), dot = svgEl.querySelector(".cdot");
    const at = (e) => {
      const rc = svgEl.getBoundingClientRect(), t = from + ((e.clientX - rc.left) / rc.width) * (to - from);
      let best = pts[0]; for (const p of pts) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
      const px = x(best[0]), down = best[1] === "down" || best[2] == null;
      cur.setAttribute("x1", px); cur.setAttribute("x2", px); cur.setAttribute("visibility", "visible");
      if (down) dot.setAttribute("visibility", "hidden"); else { dot.setAttribute("cx", px); dot.setAttribute("cy", y(best[2])); dot.setAttribute("visibility", "visible"); }
      tipShow(rc.left + (px / W) * rc.width, rc.top + 10, `${esc(hm(best[0]))}<span>${down ? "No answer" : `${best[2]} ms${best[1] === "warn" ? " · slow" : ""}`}</span>`);
    };
    const off = () => { cur.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); $("tip").hidden = true; };
    svgEl.addEventListener("pointermove", at); svgEl.addEventListener("pointerdown", at);
    svgEl.addEventListener("pointerleave", off); svgEl.addEventListener("pointercancel", off);
  }
  // (drawn again at the new width when the window's resized)
  let rz = 0;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { for (const id of opened) { const el = document.querySelector(`.item[data-svc="${id}"]`), h = days.get(id); const sv = data?.services.find((x) => x.id === id); if (el && h && sv) draw24(el, sv, h.d); } }, 150); });

  // planned maintenance: going on now, or coming up in the next fortnight
  function maint(d) {
    const box = $("maint"), list = d.maint || [];
    box.hidden = !list.length;
    const names = Object.fromEntries([...d.services, ...d.jobs, ...(d.deps || [])].map((x) => [x.id, x.name]));
    box.innerHTML = list.map((m) => {
      const on = Date.now() >= m.starts, when = on ? `Going on now, until ${hm(m.ends)}` : `${new Date(m.starts).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${hm(m.starts)}–${hm(m.ends)}`;
      return `<div class="mt glass" data-s="plan"><span class="dot"></span><div><b>${on ? "Maintenance now" : "Planned maintenance"} · ${esc(when)}</b><p>${esc(m.title)}${m.text ? `: ${esc(m.text)}` : ""}${m.svcs.length ? ` <small>(${esc(and(m.svcs.map((id) => names[id] || id)))})</small>` : ""}</p></div></div>`;
    }).join("");
  }
  function incidents(d) {
    const names = { db: "Database and storage", ...Object.fromEntries([...d.services, ...d.jobs, ...(d.deps || [])].map((x) => [x.id, x.name])) };
    const box = $("incidents");
    if (!d.incidents.length) { box.innerHTML = `<p class="empty">No incidents in the last 90 days${d.at ? "" : " (the checks have only just begun)"}.</p>`; return; }
    box.innerHTML = d.incidents.map((x) => {
      const open = !x.ended, s = open ? "down" : "ok";
      const when = `${dm(x.started)} · ${open ? `since ${hm(x.started)}` : `${hm(x.started)}–${hm(x.ended)} · ${len(x.ended - x.started)}`}`;
      const codes = x.codes?.length ? ` · ${x.codes.map(esc).join(", ")}` : "";
      return `<article class="inc" data-s="${s}"><header><h3>${esc(x.title)}</h3><span class="tag">${open ? "Ongoing" : "Resolved"}</span></header>
        <p class="sub num">${x.svcs.length ? `${esc(and(x.svcs.map((id) => names[id] || id)))} · ` : ""}${esc(when)}${codes}</p>
        <ol class="steps">${x.updates.map((u) => `<li><time>${esc(hm(u.at))}</time><span><b>${esc(u.k)}.</b> ${esc(u.w)}</span></li>`).join("")}</ol></article>`;
    }).join("");
  }
  const APP = { chat: "Chat", chats: "Chat", weather: "Weather", fitness: "Fitness", markets: "Markets", finance: "Markets", account: "Account", auth: "Account", today: "Today", mail: "Mail", email: "Mail", home: "Home page", fitting: "Fit Studio", server: "Server" };
  // Bug codes this week, each laid out as an incident is: what it's about, where it stands (looking into it, fixed,
  // back again since it was fixed, or known), when it was seen, and its story newest first. Codes and the app alone,
  // with the site's own errors named in words: never anything anyone wrote
  const STATE = { new: ["warn", "Looking into it"], fixed: ["ok", "Fixed"], back: ["down", "Back again"], known: ["none", "Known"] };
  function bugs(d) {
    $("bugsec").hidden = !d.bugs.length;
    $("codes").innerHTML = d.bugs.map((b) => {
      const [s, tag] = STATE[b.state] || STATE.new, app = APP[b.app] || b.app, first = b.first || b.last, last = b.last || first;
      const title = b.title || `${app === "Server" ? "The site" : app}: a problem someone reported`;
      const steps = [];
      if (b.state === "back") steps.push([last, "Back again", "Seen again since it was fixed. We’re looking into it."]);
      if (b.fixedAt && (b.state === "fixed" || b.state === "back")) steps.push([b.fixedAt, "Fixed", b.state === "fixed" ? "A fix is in. It’s watched in case it comes back." : "A fix went in."]);
      if (b.state === "known") steps.push([last, "Known", "We know about it; it doesn’t stop anything working."]);
      if (b.n > 1 && last !== first && b.state !== "back") steps.push([last, "Seen again", `${b.n} times in all this week.`]);
      steps.push([first, b.app === "server" ? "Spotted" : "Reported", b.app === "server" ? "The site logged it as it happened." : "Sent from Report a Problem."]);
      steps.sort((a, b2) => b2[0] - a[0]);
      return `<article class="inc bug" data-s="${s}"><header><h3>${esc(title)}</h3><span class="tag">${esc(tag)}</span></header>
        <p class="sub num"><span class="cd">${esc(b.code)}</span> · ${esc(app)} · ${esc(dm(first))}${last !== first ? `–${esc(dm(last))}` : ""} · ${b.n} time${b.n === 1 ? "" : "s"}</p>
        <ol class="steps">${steps.map(([at, k, w]) => `<li><time>${esc(hm(at))}</time><span><b>${esc(k)}.</b> ${esc(w)}</span></li>`).join("")}</ol></article>`;
    }).join("");
  }

  // (and gone as the page scrolls, never left floating over something else)
  addEventListener("scroll", () => ($("tip").hidden = true), { passive: true });
  load();
  setInterval(() => { if (document.visibilityState === "visible") load(); }, 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && data && Date.now() - (data.fetched || 0) > 30e3) load(); });
})();
