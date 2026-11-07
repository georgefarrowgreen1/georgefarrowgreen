// status.inflite.ai's page: what /api/status says (functions/_status.js), drawn at once from what the page arrived with
// (#seed) and asked again every minute while it's on screen. One calm column: the verdict, what's happening now, the
// apps as compact rows with their days (a tap on a day opens it), the jobs and what they rely on, incidents, bug codes
// with a lookup, and updates without an account (the browser's own push, sw.js). Links: #<incident>, #IF-…, #updates.
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const MIN = 60e3, DAY = 864e5, STALE = 15 * MIN;
  const ICON = {
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6M12 17v.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 7v5l3 2"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    left: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    bell: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-label="You get updates for this"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };
  // (each app's own logo for the app, its job and the home page; what's outside InFlite keeps a plain glyph)
  const LOGO = { today: "today", morning: "today", chat: "chat", notify: "chat", weather: "weather", wxtick: "weather", fitness: "fitness", garmin: "fitness",
    markets: "markets", mkttick: "markets", mail: "mail", auth: "account", account: "account", home: "home" };
  const GLYPH = {
    "dep-weather": '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 7.9Z"/>', "dep-prices": '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    "dep-garmin": '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>', "dep-email": '<path d="m22 2-7 20-4-9-9-4Z"/>',
  };
  const logo = (id, size = 28) => LOGO[id] ? `<img class="lg" src="icons/${LOGO[id]}.svg" alt="" width="${size}" height="${size}" decoding="async">`
    : `<span class="gl"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[id] || '<circle cx="12" cy="12" r="8"/>'}</svg></span>`;
  const hm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dm = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const keyDate = (k) => new Date(`${k}T12:00:00`);
  const dayLong = (k) => keyDate(k).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const ukDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
  const keyOf = (t) => ukDay.format(t);
  const and = (a) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
  const mins = (ms) => { const m = Math.max(1, Math.round(ms / MIN)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`; };
  const ago = (t) => { const m = Math.round((Date.now() - t) / MIN); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : dm(t); };
  const pct = (v) => (v == null ? "–" : v >= 100 ? "100%" : `${(Math.floor(v * 100) / 100).toFixed(2)}%`);
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };

  let data = null, period = 0, daySel = null;
  const opened = new Set(), expandedIncidents = new Set(), points = new Map();
  const PERIODS = [["All", 0], ["30 days", 30], ["7 days", 7]];
  const GROUPS = [["apps", "Apps"], ["account", "Your account"], ["home", "georgefarrowgreen.com"]];
  const SUB_APPS = ["today", "chat", "weather", "fitness", "markets", "mail"];
  let sub = store.get("status:sub");   // ({ apps, maint } while this device gets updates)

  // ---- asking ----
  function seed() { try { const el = $("seed"); return el ? JSON.parse(el.textContent) : null; } catch (_) { return null; } }
  // (one ask at a time; one that fails keeps what's shown, says the page is behind rather than the checks, and tries again
  // in 15 seconds, as a phone that's just woken often has no connection for its first few)
  let loading = null, retryT = 0;
  function load() {
    if (loading) return loading;
    clearTimeout(retryT);
    return (loading = (async () => {
      try {
        const r = await fetch("/api/status", { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        data = await r.json(); data.fetched = Date.now();
        draw();
      } catch (_) {
        if (!data) unreachable(); else { data.failed = Date.now(); verdict(); }
        retryT = setTimeout(load, 15e3);
      } finally { loading = null; }
    })());
  }
  // (back on the page: asked again where what's shown is over half a minute old, or the last ask failed)
  const freshen = () => {
    if (document.visibilityState === "hidden" || !(!data || data.failed || Date.now() - (data.fetched || 0) > 30e3)) return;
    if (data?.services) verdict();   // (the old copy said to be one while it's asked)
    load();
  };
  function unreachable() {
    const v = $("verdict"); v.dataset.s = "warn";
    v.innerHTML = `<span class="halo"><b>${ICON.alert}</b></span><div><h2>The checks can’t be read just now</h2><p>This page couldn’t reach the status checks. Try again in a minute.</p></div>`;
  }

  // ---- what each thing is doing ----
  const firstIx = () => Math.max(0, (data.dayKeys || []).indexOf(data.since));
  const span = () => { const all = data.dayKeys.length - firstIx(); return PERIODS[period][1] ? Math.min(all, PERIODS[period][1]) : all; };
  const shownDays = (s) => s.days.slice(-span());
  const uptimeOf = (days) => { let n = 0, down = 0; for (const d of days) if (d) { n += d.n; down += d.down; } return n ? ((n - down) / n) * 100 : null; };
  const live = () => (data.incidents || []).filter((x) => !x.ended);
  const maintNow = () => (data.maint || []).find((m) => m.starts <= Date.now() && m.ends > Date.now());
  const incOn = (id, key) => (data.incidents || []).filter((x) => x.svcs.includes(id) && keyOf(x.started) <= key && keyOf(x.ended || Date.now()) >= key);
  const stale = () => !data.at || Date.now() - data.at > STALE;
  // (what's shown is the page's own old copy, not the checks' latest: its last ask failed, or it's not been asked since
  // the phone slept or the tab came back from the browser's cache)
  const behind = () => !!data.failed || Date.now() - (data.fetched || 0) > 2 * MIN;
  function stateOf(s) {
    const l = live().find((x) => x.svcs.includes(s.id));
    if (s.s === "down") return ["down", l ? `Down since ${hm(l.started)}` : "Down"];
    const m = maintNow(); if (m && (!m.svcs.length || m.svcs.includes(s.id))) return ["plan", "Maintenance"];
    if (s.s === "warn") return ["warn", "Slow"];
    if (s.s === "none") return ["none", "Not checked"];
    return ["ok", pct(uptimeOf(shownDays(s)))];
  }

  // ---- drawing ----
  function draw() {
    const active = document.activeElement;
    const incident = active?.closest("[data-incident]")?.dataset.incident;
    const selector = incident && active.tagName === "SUMMARY" ? `[data-incident="${CSS.escape(incident)}"] summary` : active?.dataset.copy ? `[data-copy="${CSS.escape(active.dataset.copy)}"]` : active?.dataset.copycode ? `[data-copycode="${CSS.escape(active.dataset.copycode)}"]` : null;
    verdict(); liveBlock(); groups(); incidents(); codes();
    if (selector && !active.isConnected) document.querySelector(selector)?.focus({ preventScroll: true });
    $("subBtn").dataset.on = sub ? "1" : "0"; $("subBtn").lastElementChild.textContent = sub ? "Updates on" : "Get updates";
  }
  function verdict() {
    const d = data, v = $("verdict"), apps = d.services.filter((s) => s.group === "apps");
    const all = [...d.services, ...d.jobs.map((j) => ({ ...j, s: j.s === "ok" && j.at && Date.now() - j.at > STALE ? "warn" : j.s })), ...(d.deps || [])], down = all.filter((x) => x.s === "down"), slow = all.filter((x) => x.s === "warn");
    const l = live()[0], m = maintNow();
    let st, title, sub;
    if (!d.at) [st, title, sub] = ["none", "Checks starting", "The first checks run within five minutes of this page going up."];
    else if (stale() && behind()) [st, title, sub] = ["warn", "This page is out of date", `It couldn’t reach the checks just now, so what’s below is from ${ago(d.at)}. Trying again…`];
    else if (stale()) [st, title, sub] = ["warn", "The checks are running late", `The last check was ${ago(d.at)}. What’s below is from then.`];
    else if (down.length) [st, title, sub] = ["down", `${and(down.map((x) => x.name))} ${down.length > 1 ? "aren’t" : "isn’t"} answering`, l ? updateLine(l) : "We’re looking into it."];
    else if (l) [st, title, sub] = ["down", l.title, updateLine(l)];
    else if (m) [st, title, sub] = ["plan", `Maintenance: ${m.title}`, `Until ${hm(m.ends)}.${m.text ? ` ${m.text}` : ""}`];
    else if (slow.length) [st, title, sub] = ["warn", "A few things are slow", `${and(slow.map((x) => x.name))}: slower than usual or running late. Everything else is normal.`];
    else [st, title, sub] = ["ok", "Everything’s working", `All ${apps.length} apps, and everything they rely on`];
    const up = uptimeOf(apps.flatMap(shownDays)), last = d.incidents.filter((x) => x.ended)[0];
    v.dataset.s = st;
    v.innerHTML = `<span class="halo"><b>${st === "down" || st === "warn" ? ICON.alert : st === "none" || st === "plan" ? ICON.clock : ICON.check}</b></span>
      <div><span class="eyebrow">System status</span><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
      <div class="vstats num">
        ${l ? `<a class="hot" href="#${esc(l.id)}"><b data-since="${l.started}">${mins(Date.now() - l.started)}</b><span>so far</span></a>` : `<div><b>${pct(up)}</b><span>${period ? `up, last ${PERIODS[period][0]}` : `up since ${d.since ? dm(keyDate(d.since)) : "checks began"}`}</span></div>`}
        <div><b data-ago="${d.at || ""}">${d.at ? ago(d.at) : "–"}</b><span>last checked</span></div>
        ${l ? `<a href="#${esc(l.id)}"><b>${esc(l.updates[0]?.k || "Spotted")}</b><span>at ${hm(l.updates[0]?.at || l.started)}</span></a>`
          : last ? `<a href="#${esc(last.id)}"><b>${dm(last.started)}</b><span>last incident${last.notOutage ? ", a false alarm" : ""}</span></a>` : `<div><b>None</b><span>incidents</span></div>`}
      </div>`;
    $("mini").dataset.s = st; $("miniT").textContent = l ? `${title} · ${mins(Date.now() - l.started)}` : title;
    document.title = st === "ok" ? "InFlite Status" : `${title} · InFlite Status`;
  }
  const updateLine = (x) => { const u = x.updates[0]; return !u || u.k === "Spotted" ? "We’re looking into it." : u.w; };
  function liveBlock() {
    const box = $("live"), parts = [];
    const ls = live();
    if (ls.length) parts.push(`<section class="group"><div class="gh"><h2>Happening now</h2><span>Updated ${hm(ls[0].updates[0]?.at || ls[0].started)}</span></div><div class="glass list">${ls.map((x) => incHtml(x, true)).join("")}</div></section>`);
    for (const m of (data.maint || []).filter((x) => x.ends > Date.now()).slice(0, 2)) {
      const on = m.starts <= Date.now();
      parts.push(`<section class="glass maint" data-s="plan"><i></i><div><b>${on ? "Maintenance now" : "Planned maintenance"}: ${esc(m.title)}</b><p class="num">${esc(dayLong(keyOf(m.starts)))} · ${hm(m.starts)}–${hm(m.ends)} · <span data-until="${m.starts}">${countdown(m.starts)}</span>${m.text ? ` · ${esc(m.text)}` : ""}</p></div><button class="pill" type="button" data-cal="${esc(m.id)}">Add to calendar</button></section>`);
    }
    box.innerHTML = parts.join(""); box.hidden = !parts.length;
  }
  const countdown = (t) => { const ms = t - Date.now(); if (ms <= 0) return "going on now"; const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / MIN); return `in ${h >= 24 ? `${Math.floor(h / 24)} day${h >= 48 ? "s" : ""}, ${h % 24} h` : `${h} h ${m} min`}`; };

  function groups() {
    const focused = document.activeElement;
    const focusSelector = focused?.dataset.toggle ? `[data-toggle="${CSS.escape(focused.dataset.toggle)}"]` : focused?.dataset.period != null ? `[data-period="${focused.dataset.period}"]` : focused?.dataset.k ? `.days[data-svc="${CSS.escape(focused.parentElement.dataset.svc)}"] [data-k="${focused.dataset.k}"]` : null;
    const d = data, box = $("groups"), n = span(), keys = d.dayKeys.slice(-n);
    let html = "";
    GROUPS.forEach(([g, title], gi) => {
      const items = d.services.filter((s) => s.group === g);
      if (!items.length) return;
      const bad = items.filter((s) => stateOf(s)[0] !== "ok").length;
      html += `<section class="group"${gi === 0 ? ' id="apps"' : ""}><div class="gh"><h2>${esc(title)}</h2>${gi === 0
        ? `<div class="seg" role="group" aria-label="How far back">${PERIODS.map(([l], i) => `<button type="button" data-period="${i}" aria-pressed="${period === i}">${l}</button>`).join("")}</div>`
        : `<span>${bad ? `${bad} not working` : items.length > 1 ? `All ${items.length} working` : "Working"}</span>`}</div>
        ${gi === 0 ? `<p class="section-note">Select an app for response times, or a day to see its checks.</p>` : ""}<div class="glass rows">${items.map((s) => appHtml(s, keys)).join("")}
        <div class="dfoot num"><span>${period ? dm(keyDate(keys[0])) : `Since ${dm(keyDate(keys[0]))}`}</span><span>Today</span></div></div></section>`;
    });
    const jobs = d.jobs.map((j) => ({ ...j, s: j.s === "ok" && j.at && Date.now() - j.at > STALE ? "warn" : j.s }));
    html += `<div class="operations" id="operations"><section class="group"><div class="gh"><h2>Scheduled jobs</h2><span>Every 5 min</span></div><ul class="glass status-list">${jobs.map((j) =>
      `<li class="status-row" data-s="${esc(j.s)}">${logo(j.id, 22)}<div><b>${esc(j.name)}</b><small class="num">${j.at ? `Last ran ${hm(j.at)}${j.ms != null ? ` · ${(j.ms / 1000).toFixed(1)} s` : ""}` : "Not run yet"}</small></div><span class="status-dot" role="img" aria-label="${j.s === "down" ? "Failed" : j.s === "warn" ? "Late" : j.s === "ok" ? "Working" : "Pending"}" title="${j.s === "down" ? "Failed" : j.s === "warn" ? "Late" : j.s === "ok" ? "Working" : "Pending"}"></span></li>`).join("")}</ul></section>`;
    const deps = d.deps || [];
    if (deps.length) html += `<section class="group"><div class="gh"><h2>API’s and Connectors</h2><span>${deps.filter((x) => x.s !== "ok").length ? "Needs attention" : "All working"}</span></div><ul class="glass status-list">${deps.map((x) =>
      `<li class="status-row" data-s="${esc(x.s)}">${logo(x.id, 22)}<div><b>${esc(x.name)}</b><small class="num">${x.s === "down" ? esc(x.why || "Not answering") : x.s === "none" ? "Not checked yet" : x.ms != null ? `Response ${x.ms} ms` : ""}</small></div><span class="status-dot" role="img" aria-label="${x.s === "down" ? "Down" : x.s === "warn" ? "Slow" : x.s === "ok" ? "Working" : "Pending"}" title="${x.s === "down" ? "Down" : x.s === "warn" ? "Slow" : x.s === "ok" ? "Working" : "Pending"}"></span></li>`).join("")}</ul></section>`;
    html += `</div>`;
    html += `<div class="status-legend" aria-label="Status key"><span data-s="ok"><i></i>Working</span><span data-s="warn"><i></i>Slow, late or pending</span><span data-s="down"><i></i>Not working</span><span data-s="none"><i></i>No history</span></div>`;
    box.innerHTML = html;
    if (focusSelector) box.querySelector(focusSelector)?.focus({ preventScroll: true });
    for (const d of box.querySelectorAll(".days[data-n]")) d.style.gridTemplateColumns = `repeat(${d.dataset.n}, minmax(0, 1fr))`;
    wireDays(); for (const id of opened) chart(id);
  }
  function appHtml(s, keys) {
    const [st, word] = stateOf(s), days = shownDays(s), open = opened.has(s.id), lastI = days.length - 1;
    const mine = sub && SUB_APPS.includes(s.id) && sub.apps.includes(s.id);
    const checks = (s.checks || []).map((c) => `<div data-s="${esc(c.s)}"><i></i><span>${esc(c.k)}</span><em>${c.s === "down" ? esc(c.why || "Not answering") : c.at ? `ran ${hm(c.at)}` : c.ms != null ? `${c.ms} ms` : c.s === "none" ? "Not checked" : "Working"}</em></div>`).join("");
    return `<div class="app${open ? " open" : ""}" data-id="${esc(s.id)}">
      <button class="arow" type="button" data-toggle="${esc(s.id)}" aria-expanded="${open}">${logo(s.id)}<b>${esc(s.name)}${mine ? ICON.bell : ""}</b><span class="st num" data-s="${st}"><i></i>${st === "ok" ? `<span>${esc(word.replace("%", ""))}<small>%</small></span>` : esc(word)}</span>${ICON.chev}</button>
      <div class="days" data-n="${days.length}" data-svc="${esc(s.id)}">${days.map((x, i) => {
        const k = keys[i], ds = x ? x.s : "none", inc = incOn(s.id, k).length;
        return `<button type="button" data-k="${k}" data-s="${ds}" class="${[inc ? "inc" : "", i === lastI ? "today" : ""].join(" ").trim()}" aria-label="${esc(`${s.name}, ${dayLong(k)}${i === lastI ? " so far" : ""}: ${!x ? "not checked" : ds === "ok" ? "no problems" : ds === "warn" ? "slow or briefly down" : "down for a while"}${inc ? ", an incident" : ""}`)}"></button>`; }).join("")}</div>
      ${open ? `<div class="more"><div class="chart" data-chart="${esc(s.id)}"><p class="chart-note">Loading…</p></div><div class="checks">${checks}</div>
        <p class="meta num">${s.version ? `Version ${esc(s.version)} · ` : ""}${esc(s.address)}</p></div>` : ""}
    </div>`;
  }

  // (an open row's last 24 hours: each check a point, where it didn't answer shaded; a finger or pointer along it reads
  // any moment's)
  async function chart(id) {
    const box = document.querySelector(`[data-chart="${CSS.escape(id)}"]`);
    if (!box) return;
    let d = points.get(id);
    if (!d || Date.now() - d.got > MIN) {
      try { const r = await fetch(`/api/status/day?svc=${encodeURIComponent(id)}`); if (!r.ok) throw new Error(); d = { ...(await r.json()), got: Date.now() }; points.set(id, d); }
      catch (_) { if (!d) { box.innerHTML = '<p class="chart-note">The response times couldn’t be loaded.</p>'; return; } }
    }
    const pts = d.points.filter((p) => p[1] !== "none");
    if (pts.length < 2) { box.innerHTML = '<p class="chart-note">A line appears after a few more checks, every five minutes.</p>'; return; }
    const known = pts.filter((p) => p[2] != null).map((p) => p[2]).sort((a, b) => a - b), mid = known.length ? known[Math.floor(known.length / 2)] : null;
    const from = Math.max(d.from, pts[0][0] - 5 * MIN), to = d.to, W = 600, H = 72, top = Math.max(100, (known[known.length - 1] || 100) * 1.15);
    const X = (t) => ((t - from) / (to - from)) * W, Y = (v) => H - 4 - (Math.min(v, top) / top) * (H - 10);
    let line = "", segs = [], gaps = "";
    const flush = () => { if (segs.length > 1) line += `M${segs.join("L")}`; segs = []; };
    for (const [t, s, ms] of pts) { if (s === "down" || ms == null) { flush(); if (s === "down") gaps += `<rect x="${(X(t) - 3).toFixed(1)}" y="0" width="6" height="${H}" class="gap"/>`; continue; } segs.push(`${X(t).toFixed(1)} ${Y(ms).toFixed(1)}`); }
    flush();
    box.innerHTML = `<div class="lbl"><b>Response time, ${to - from > 23 * 3600e3 ? "24 hours" : `since ${hm(from)}`}</b><span class="num">${mid != null ? `typically ${mid} ms` : ""}</span></div>
      <div class="plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Response time over the last day${mid != null ? `, typically ${mid} milliseconds` : ""}">${gaps}<path d="${line}" class="ln" vector-effect="non-scaling-stroke"/></svg></div>
      <div class="ax num"><span>${hm(from)}</span><span>${hm(from + (to - from) / 2)}</span><span>Now</span></div>`;
    const plot = box.querySelector(".plot");
    const at = (e) => {
      const r = plot.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), t = from + f * (to - from);
      let best = pts[0]; for (const p of pts) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
      const bf = (best[0] - from) / (to - from), txt = best[1] === "down" || best[2] == null ? `${hm(best[0])} · no answer` : `${hm(best[0])} · ${best[2]} ms${best[1] === "warn" ? " · slow" : ""}`;
      plot.querySelector(".cur")?.remove(); plot.querySelector(".read")?.remove();
      // (placed through the style object: the page's rules allow no style written in its markup)
      plot.insertAdjacentHTML("beforeend", `<span class="cur"></span><span class="read num">${esc(txt)}</span>`);
      plot.querySelector(".cur").style.left = `${bf * 100}%`; plot.querySelector(".read").style.left = `${Math.min(82, Math.max(18, bf * 100))}%`;
    };
    const off = () => { plot.querySelector(".cur")?.remove(); plot.querySelector(".read")?.remove(); };
    plot.addEventListener("pointermove", at); plot.addEventListener("pointerdown", at); plot.addEventListener("pointerleave", off);
  }

  // ---- incidents and codes, one layout ----
  const STAGES = ["Investigating", "Identified", "Monitoring", "Resolved"];
  function incHtml(x, stages) {
    const open = !x.ended, names = x.svcs.map((id) => nameOf(id)).filter(Boolean);
    const stage = (x.updates.find((u) => STAGES.includes(u.k)) || { k: "Investigating" }).k, at = STAGES.indexOf(stage);
    return `<article class="inc" id="${esc(x.id)}" data-s="${open ? "down" : "ok"}"><header><h3>${esc(x.title)}</h3><div class="tags">${x.notOutage ? `<span class="tag" data-s="none">Not an outage</span>` : ""}<span class="tag">${open ? "Ongoing" : "Resolved"}</span></div></header>
      <p class="sub num"><span>${names.length ? `${esc(and(names))} · ` : ""}${dm(x.started)} · ${hm(x.started)}${open ? "" : `–${hm(x.ended)}`}</span><span class="dur">${open ? `<span data-since="${x.started}">${mins(Date.now() - x.started)}</span> so far` : mins(x.ended - x.started)}</span></p>
      ${stages && open ? `<div class="stages">${STAGES.map((n, i) => `<div class="${i < at ? "done" : i === at ? "now" : ""}"><i></i>${n}</div>`).join("")}</div>` : ""}
      ${!open ? `<details class="incident-detail" data-incident="${esc(x.id)}"${expandedIncidents.has(x.id) ? " open" : ""}><summary>View incident updates${ICON.chev}</summary>` : ""}<ol class="steps">${x.updates.map((u) => `<li><time>${esc(hm(u.at))}</time><span><b>${esc(u.k)}.</b> ${esc(u.w)}</span></li>`).join("")}</ol>
      <button class="copy" type="button" data-copy="${esc(x.id)}">Copy link to this incident</button>${!open ? "</details>" : ""}</article>`;
  }
  const nameOf = (id) => [...data.services, ...data.jobs, ...(data.deps || [])].find((x) => x.id === id)?.name || (id === "db" ? "Database and storage" : null);
  function incidents() {
    const list = data.incidents.filter((x) => x.ended), months = [];
    for (const x of list) { const m = new Date(x.started).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); if (months.at(-1)?.m !== m) months.push({ m, xs: [] }); months.at(-1).xs.push(x); }
    $("incSince").textContent = data.since ? `Since ${dm(keyDate(data.since))}` : "Last 90 days";
    $("incs").innerHTML = list.length ? months.map((g) => `<div><div class="month">${esc(g.m)}</div>${g.xs.map((x) => incHtml(x)).join("")}</div>`).join("")
      : `<p class="empty">No incidents${data.since ? ` since checks began on ${dm(keyDate(data.since))}` : " in the last 90 days"}.</p>`;
  }
  const APPN = { chat: "Chat", chats: "Chat", weather: "Weather", fitness: "Fitness", markets: "Markets", finance: "Markets", account: "Account", auth: "Account", today: "Today", mail: "Mail", email: "Mail", home: "Home page", server: "The site" };
  const CSTATE = { new: ["warn", "Looking into it"], fixed: ["ok", "Fixed"], back: ["down", "Back again"], known: ["none", "Known"] };
  function codeHtml(b) {
    const [s, tag] = CSTATE[b.state] || CSTATE.new, app = APPN[b.app] || b.app, first = b.first || b.last, last = b.last || first;
    const title = b.title || `${app}: a problem someone reported`, steps = [];
    if (b.state === "back") steps.push([last, "Back again", "Seen again since it was fixed. We’re looking into it."]);
    if (b.fixedAt && (b.state === "fixed" || b.state === "back")) steps.push([b.fixedAt, "Fixed", b.state === "fixed" ? "A fix is in. It’s watched in case it comes back." : "A fix went in."]);
    if (b.state === "known") steps.push([last, "Known", "We know about it; it doesn’t stop anything working."]);
    if (b.n > 1 && last !== first && b.state !== "back") steps.push([last, "Seen again", `${b.n} times in all.`]);
    steps.push([first, b.app === "server" ? "Spotted" : "Reported", b.app === "server" ? "The site logged it as it happened." : "Sent from Report a Problem."]);
    steps.sort((a, c) => c[0] - a[0]);
    return `<article class="inc" id="${esc(b.code)}" data-s="${s}"><header><h3>${esc(title)}</h3><div class="tags"><span class="tag">${esc(tag)}</span></div></header>
      <p class="sub num"><span class="cd">${esc(b.code)}</span><button class="cpy" type="button" data-copycode="${esc(b.code)}" aria-label="Copy ${esc(b.code)}">Copy</button><span>${esc(app)} · ${esc(dm(first))}${keyOf(last) !== keyOf(first) ? `–${esc(dm(last))}` : ""} · ${b.n} time${b.n === 1 ? "" : "s"}</span></p>
      <ol class="steps">${steps.map(([t, k, w]) => `<li><time>${esc(hm(t))}</time><span><b>${esc(k)}.</b> ${esc(w)}</span></li>`).join("")}</ol></article>`;
  }
  function codes() {
    $("codes").innerHTML = data.bugs.length ? data.bugs.map(codeHtml).join("") : `<p class="empty">No bug codes this week.</p>`;
  }
  // (a code typed any way: lower case, spaces, no dashes; this week's on the page, older ones asked of the server)
  const norm = (v) => { const c = String(v).toUpperCase().replace(/[^0-9A-Z]/g, ""); const m = /^IF([A-Z])([0-9A-Z]{4,6})$/.exec(c); return m ? `IF-${m[1]}-${m[2]}` : null; };
  let lookupId = 0;
  async function lookup() {
    const requestId = ++lookupId;
    const raw = $("lookIn").value.trim(), code = norm(raw), out = $("found");
    if (!raw) { out.innerHTML = ""; return; }
    if (!code) { out.innerHTML = `<p class="nf">That doesn’t look like a code. They start IF-, then a letter and five more, like IF-T-RMS1H.</p>`; return; }
    $("lookIn").value = code;
    if (document.getElementById(code)?.closest("#codes")) { out.innerHTML = ""; flash(code, "center"); return; }
    out.innerHTML = `<p class="nf">Looking…</p>`;
    try {
      const r = await fetch(`/api/status/code?c=${encodeURIComponent(code)}`); const j = await r.json();
      if (requestId !== lookupId) return;
      if (!r.ok) throw new Error(j.error);
      out.innerHTML = j.found ? `<div class="list">${codeHtml(j)}</div>`
        : `<p class="nf">${j.last ? `<b>${esc(code)}</b> was last seen on ${esc(dm(j.last))}, and not in the last 30 days.` : `We haven’t seen <b>${esc(code)}</b> in the last 30 days. If you’ve only just sent it, look again in a minute.`}</p>`;
    } catch (e) { if (requestId !== lookupId) return; out.innerHTML = `<p class="nf">${esc(e.message || "That couldn’t be looked up just now. Try again in a moment.")}</p>`; }
  }

  // ---- a day, tapped: its counts, its quarter-hours (each check is kept two days), what happened ----
  function wireDays() {
    for (const strip of document.querySelectorAll(".days")) strip.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (b) openDay(strip.dataset.svc, b.dataset.k);
    });
  }
  async function openDay(id, k) {
    const s = data.services.find((x) => x.id === id), i = data.dayKeys.indexOf(k), d = s?.days[i];
    if (!s || i < 0) return;
    daySel = { id, k };
    const isToday = k === data.dayKeys.at(-1), incs = incOn(id, k), fa = incs.some((x) => x.notOutage);
    const first = firstIx(), lastIx = data.dayKeys.length - 1;
    const line = !d ? "Not checked this day" : `${d.n} check${d.n === 1 ? "" : "s"} · ${d.slow ? `${d.slow} slow` : "none slow"} · ${d.down ? `${d.down} failed` : fa ? "failed checks were a false alarm" : "none failed"}`;
    sheet(`<div class="grab"></div>
      <div class="sh"><button class="ib" type="button" data-step="-1" aria-label="The day before" ${i <= first ? "disabled" : ""}>${ICON.left}</button><h3 id="sheetTitle">${esc(s.name)}<small>${esc(dayLong(k))}${isToday ? " · so far" : ""}</small></h3><button class="ib" type="button" data-step="1" aria-label="The day after" ${i >= lastIx ? "disabled" : ""}>${ICON.right}</button></div>
      <p class="sub2 num">${esc(line)}</p>
      <div class="hours" id="hours"><p class="hint">Loading the day’s hours…</p></div>
      <div class="three num"><div data-s="${d ? d.s : "none"}"><b class="sv">${d ? pct(d.up) : "–"}</b><small>up${fa ? ", counted" : ""}</small></div><div><b id="dayMs">–</b><small>typical</small></div><div><b>${incs.length}</b><small>incident${incs.length === 1 ? "" : "s"}</small></div></div>
      ${incs.length ? `<div class="card list">${incs.map((x) => incHtml(x)).join("")}</div>` : `<p class="hint center">${!d ? "" : d.s === "ok" ? "Nothing went wrong this day." : "Slow for part of the day; nothing long enough to open an incident."}</p>`}
      <button class="big g" type="button" data-close="1">Done</button>`);
    for (const b of document.querySelectorAll(".days button.sel")) b.classList.remove("sel");
    document.querySelector(`.days[data-svc="${CSS.escape(id)}"] button[data-k="${k}"]`)?.classList.add("sel");
    const box = $("hours");
    try {
      const r = await fetch(`/api/status/hours?svc=${encodeURIComponent(id)}&day=${k}`); const h = await r.json();
      if (daySel?.k !== k || daySel?.id !== id) return;
      if (!h.kept) { box.innerHTML = `<p class="hint">Each check is kept for two days; days before that are kept as totals.</p>`; return; }
      if (h.ms != null) $("dayMs").textContent = `${h.ms} ms`;
      const faQ = new Set();
      for (const x of incs.filter((y) => y.notOutage)) for (let q = 0; q < 96; q++) { const qs = keyDate(k).setHours(0, 0, 0, 0) + q * 15 * MIN; if (qs + 15 * MIN > x.started && qs < x.ended) faQ.add(q); }
      box.innerHTML = `<div class="q" role="img" aria-label="${esc(h.q.includes("down") ? "Failed checks in some quarter-hours" : h.q.includes("warn") ? "A few slow quarter-hours" : "Fine all day")}">${h.q.map((v, q) => `<i data-s="${v}"${faQ.has(q) && v === "ok" ? ' class="fa"' : ""}></i>`).join("")}</div>
        <div class="ax num"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
        <div class="key"><span data-s="ok"><i></i>Fine</span><span data-s="warn"><i></i>Slow</span><span data-s="down"><i></i>Failed</span>${faQ.size ? `<span><i class="fa"></i>False alarm</span>` : ""}${isToday ? `<span data-s="none"><i></i>Not yet</span>` : ""}</div>`;
    } catch (_) { box.innerHTML = `<p class="hint">The day’s hours couldn’t be loaded.</p>`; }
  }

  // ---- updates without an account ----
  const canPush = () => "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
  const iosBrowser = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !matchMedia("(display-mode: standalone)").matches && !navigator.standalone;
  let pick = null;
  function subSheet() {
    pick ||= new Set(sub?.apps || ["today", "chat", "weather", "mail"]);
    const apps = data ? data.services.filter((s) => SUB_APPS.includes(s.id)) : [];
    const blocked = typeof Notification !== "undefined" && Notification.permission === "denied";
    sheet(`<div class="grab"></div>
      <div class="sh"><span></span><h3 id="sheetTitle">Get updates</h3><button class="ib" type="button" data-close="1" aria-label="Close">${ICON.x}</button></div>
      <p class="hint center">A notification on this device when an app you use stops working, and when it’s back. No account needed.</p>
      <div class="chips" role="group" aria-label="Which apps">${apps.map((s) => `<button class="chip" type="button" data-pick="${esc(s.id)}" aria-pressed="${pick.has(s.id)}">${logo(s.id, 20)}${esc(s.name)}</button>`).join("")}</div>
      <label class="sw"><span>Planned maintenance too</span><input type="checkbox" id="subMaint" ${sub?.maint ? "checked" : ""}></label>
      ${!canPush() ? `<p class="said">${iosBrowser() ? "On iPhone and iPad, add this page to your Home Screen first (Share, then Add to Home Screen), and open it from there." : "This browser can’t show notifications from a web page."}</p>`
        : blocked ? `<p class="said">Notifications are blocked for this page. Allow them in your browser’s settings, then try again.</p>` : ""}
      <button class="big" type="button" data-sub="on" ${!canPush() || blocked || !pick.size ? "disabled" : ""}>${sub ? "Save" : "Notify me on this device"}</button>
      ${sub ? `<button class="big g" type="button" data-sub="off">Turn updates off</button>` : ""}
      <p class="said" id="subSaid" role="alert"></p>
      <p class="hint">Sent when an incident opens, when there’s news, and when it’s over: never for a slow check alone. Or follow the feed in any news reader: <b>status.inflite.ai/feed.xml</b></p>`);
  }
  async function subscribe() {
    const said = $("subSaid");
    try {
      said.textContent = "";
      const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (perm !== "granted") { said.textContent = "Notifications weren’t allowed, so nothing’s been turned on."; return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { key } = await (await fetch("/api/status/push-key")).json();
      const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));
      const s = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
      const maint = $("subMaint").checked, apps = [...pick];
      const r = await fetch("/api/status/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sub: s.toJSON(), apps, maint }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      sub = { apps: j.apps, maint: j.maint }; store.set("status:sub", sub);
      closeSheet(); draw(); toast(`Updates on for ${and(sub.apps.map((id) => nameOf(id)))}`);
    } catch (e) { said.textContent = e.message || "That couldn’t be turned on just now. Try again in a moment."; }
  }
  async function unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/"), s = await reg?.pushManager.getSubscription();
      if (s) { await fetch("/api/status/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: s.endpoint }) }).catch(() => {}); await s.unsubscribe().catch(() => {}); }
    } catch (_) {}
    sub = null; pick = null; store.set("status:sub", null); closeSheet(); draw(); toast("Updates off on this device");
  }

  // ---- sheets, toasts, links ----
  let lastFocus = null;
  function sheet(html) {
    const el = $("sheet");
    if (!el.classList.contains("on")) lastFocus = document.activeElement;
    document.querySelector(".wrap").inert = true; document.body.classList.add("sheet-open");
    el.innerHTML = html; el.classList.add("on"); $("scrim").classList.add("on");
    el.querySelector("button:not([disabled])")?.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!$("sheet").classList.contains("on")) return;
    $("sheet").classList.remove("on"); $("scrim").classList.remove("on"); daySel = null;
    for (const b of document.querySelectorAll(".days button.sel")) b.classList.remove("sel");
    document.querySelector(".wrap").inert = false; document.body.classList.remove("sheet-open");
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    else $("subBtn").focus({ preventScroll: true });
  }
  let toastT = 0;
  const toast = (t) => { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2600); };
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function flash(id, block = "start") { const el = document.getElementById(id); if (!el) return false; const detail = el.querySelector(".incident-detail"); if (detail) { detail.open = true; expandedIncidents.add(id); } el.scrollIntoView({ behavior: still() ? "auto" : "smooth", block }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); return true; }
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h || !data) return;
    if (h === "updates") { subSheet(); return; }
    if (/^if-?[a-z]/i.test(h) && norm(h)) { $("lookIn").value = norm(h); lookup(); setTimeout(() => $("codesec").scrollIntoView({ behavior: still() ? "auto" : "smooth" }), 50); return; }
    closeSheet(); flash(h);
  }
  // (Add to calendar: a file the calendar opens)
  function calendar(id) {
    const m = (data.maint || []).find((x) => x.id === id); if (!m) return;
    const z = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InFlite//Status//EN", "BEGIN:VEVENT", `UID:${m.id}@status.inflite.ai`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(m.starts)}`, `DTEND:${z(m.ends)}`,
      `SUMMARY:InFlite maintenance: ${m.title.replace(/[,;\\]/g, " ")}`, `DESCRIPTION:${(m.text || "Planned maintenance").replace(/[,;\\]/g, " ")} https://status.inflite.ai/`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "inflite-maintenance.ics"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---- events ----
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a"); if (!t) return;
    if (t.dataset.toggle) { const id = t.dataset.toggle; opened.has(id) ? opened.delete(id) : opened.add(id); groups(); document.querySelector(`[data-toggle="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); return; }
    if (t.dataset.period != null) { period = +t.dataset.period; verdict(); groups(); return; }
    if (t.dataset.step && daySel) { const i = data.dayKeys.indexOf(daySel.k) + +t.dataset.step; if (i >= firstIx() && i < data.dayKeys.length) openDay(daySel.id, data.dayKeys[i]); return; }
    if (t.dataset.close) { closeSheet(); return; }
    if (t.dataset.copy) { const url = `${location.origin}/#${t.dataset.copy}`; navigator.clipboard?.writeText(url).then(() => toast("Link copied"), () => toast(url)); return; }
    if (t.dataset.copycode) { navigator.clipboard?.writeText(t.dataset.copycode).then(() => toast("Code copied"), () => toast(t.dataset.copycode)); return; }
    if (t.dataset.pick) { const id = t.dataset.pick; pick.has(id) ? pick.delete(id) : pick.add(id); subSheet(); return; }
    if (t.dataset.sub === "on") { subscribe(); return; }
    if (t.dataset.sub === "off") { unsubscribe(); return; }
    if (t.dataset.cal) { calendar(t.dataset.cal); return; }
    if (t.id === "subBtn") { subSheet(); return; }
    if (t.tagName === "A" && t.getAttribute("href")?.startsWith("#")) {
      e.preventDefault(); const h = t.getAttribute("href").slice(1);
      if (location.hash === "#" + h) route(); else location.hash = h;
    }
  });
  document.addEventListener("toggle", (e) => {
    const id = e.target.dataset?.incident;
    if (id) e.target.open ? expandedIncidents.add(id) : expandedIncidents.delete(id);
  }, true);
  $("scrim").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
    if (e.key !== "Tab" || !$("sheet").classList.contains("on")) return;
    const controls = [...$("sheet").querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), summary')].filter((x) => x.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
  $("lookForm").addEventListener("submit", (e) => { e.preventDefault(); lookup(); });
  addEventListener("hashchange", route);
  navigator.serviceWorker?.addEventListener?.("message", (e) => { if (e.data?.go) { location.hash = e.data.go; route(); } });
  // (the clocks: how long since the check, how long down, maintenance counting down)
  setInterval(() => {
    for (const el of document.querySelectorAll("[data-ago]")) if (el.dataset.ago) el.textContent = ago(+el.dataset.ago);
    for (const el of document.querySelectorAll("[data-since]")) el.textContent = mins(Date.now() - +el.dataset.since);
    for (const el of document.querySelectorAll("[data-until]")) el.textContent = countdown(+el.dataset.until);
    const l = data && live()[0]; if (l) $("miniT").textContent = `${$("verdict").querySelector("h2").textContent} · ${mins(Date.now() - l.started)}`;
  }, 15e3);
  // (the bar at the top, once the verdict's scrolled out of sight)
  if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { const m = $("mini"); const on = !e.isIntersecting && e.boundingClientRect.top < 0; m.classList.toggle("on", on); m.setAttribute("aria-hidden", String(!on)); m.inert = !on; }).observe($("verdict"));
  // what the page came with, drawn at once; then asked, and every minute while it's looked at
  const s0 = seed();
  if (s0) { data = { ...s0, fetched: Date.now() }; draw(); route(); }
  load().then(() => { if (!s0) route(); });
  setInterval(() => { if (document.visibilityState === "visible") load(); }, 60e3);
  document.addEventListener("visibilitychange", freshen);
  // (Safari's back-forward cache brings the page back as it was, often with no visibilitychange; and a phone that's woken
  // gets its connection back after the page is shown)
  addEventListener("pageshow", (e) => { if (e.persisted) freshen(); });
  addEventListener("focus", freshen);
  addEventListener("online", freshen);
})();
