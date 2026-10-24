// InFlight Live (tracker.html): every pigeon in the air, on a computer, with no one in it.
// What it draws comes from /api/pigeon/tracker (functions/_tracker.js), which decides what
// may be shown: this page only ever has rough dots, never a name, a route or an id.
import { LAND } from "./land.js";

const KINDS = [["standard", "Standard"], ["swift", "Swift"], ["turbo", "Turbo"], ["rocket", "Rocket"], ["mystery", "Mystery"]];
const NAME = Object.fromEntries(KINDS);
const EVERY = 60e3, TOP = 80, BOTTOM = -58;      // (the map leaves out the far south: no one lives there)
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// a computer (the same rule the app uses, the other way round: an iPad calling itself a Mac has a touchscreen)
const ua = navigator.userAgent || "";
const phone = /iPhone|iPod|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
if (phone) { $(".tk").hidden = true; $(".tk-phone").hidden = false; $(".tk-addr").textContent = `${location.host}${location.pathname}`; }
else start();

function start() {
  const cv = $(".tk-map"), g = cv.getContext("2d"), tip = $(".tk-tip");
  // coastlines, joined up across the date line (so Russia's far east isn't a stripe round the world)
  const rings = LAND.split(";").map((r) => {
    const a = r.split(",").map((n) => n / 2);
    for (let i = 2; i < a.length; i += 2) a[i] += Math.round((a[i - 2] - a[i]) / 360) * 360;
    // (then back round to the usual side: Afro-Eurasia starts in Chukotka, past the date line)
    let lo = Infinity, hi = -Infinity; for (let i = 0; i < a.length; i += 2) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); }
    const back = Math.round(-(lo + hi) / 2 / 360) * 360; if (back) for (let i = 0; i < a.length; i += 2) a[i] += back;
    // one that goes right round the world (Antarctica) closes over its pole
    if (Math.abs(a[a.length - 2] - a[0]) > 180) { const pole = a[1] < 0 ? -90 : 90; a.push(a[a.length - 2], pole, a[0], pole); }
    return a;
  });
  let data = null, shown = [], marks = [], when = 0, failed = false, W = 0, H = 0, dpr = 1, base = null, hover = null;
  // where the map looks (it wraps round the world): its middle, and how close in
  let cLon = 15, cLat = 22, zoom = 1.5;          // (zoom 1: the whole world)
  // (drawn every frame for the dots' pulse; with Reduce Motion, only when something changes)
  const STILL = matchMedia("(prefers-reduced-motion: reduce)");
  // each kind's colour, looked up once (asking the page's style for it, for every dot every frame, was most of the work)
  const KC = {}, kc = (k) => (KC[k] ||= css(`--k-${k}`) || css("--k-standard"));
  // and its glow, drawn once as a soft disc, stamped under each dot (not a new gradient for every dot every frame)
  const GLOW = {}, glowOf = (k) => GLOW[k] ||= (() => {
    const c = document.createElement("canvas"), R = 48, x = c.getContext("2d"), col = kc(k); c.width = c.height = R * 2;
    const gr = x.createRadialGradient(R, R, 0, R, R, R); gr.addColorStop(0, col + "66"); gr.addColorStop(1, col + "00");
    x.fillStyle = gr; x.fillRect(0, 0, R * 2, R * 2); return c;
  })();
  // the land and night, kept as a picture: while the map moves it's drawn moved and scaled (bv: the view it was drawn
  // for), and drawn again once it's been still a moment; a new minute's dots fade in over the last ones (fadeFrom)
  let bv = null, movedAt = 0, fadeFrom = null, fadeAt = 0, glide = 0, goal = null, req = 0, mk = "";
  const bgCanvas = document.createElement("canvas");
  const PANEL = () => ($(".tk-panel").getBoundingClientRect().right || 0) + 20;

  // equirectangular: the whole world fits the space beside the panel at zoom 1
  const view = () => {
    const free = Math.max(200, W - PANEL()), s = Math.max(free / 360, 1) * zoom * 1.08;
    const half = (H / 2) / s, lat = (TOP - BOTTOM) * s <= H ? (TOP + BOTTOM) / 2 : Math.min(TOP - half, Math.max(BOTTOM + half, cLat));
    cLat = lat;
    return { s, cx: PANEL() + free / 2, cy: H / 2, lon: cLon, lat };
  };
  // a point, on the copy of the world nearest the middle
  const xy = (lat, lon, v = view()) => { let d = lon - v.lon; d -= Math.round(d / 360) * 360; return [v.cx + d * v.s, v.cy + (v.lat - lat) * v.s]; };

  function size() {
    dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); base = null; fadeFrom = null; mk = ""; frame();
  }
  // the land, the grid and the night, drawn once a minute (or on resize, or once it's stopped moving), into one canvas
  // kept for it; and the dots' trails over them (they change only as the dots or the view do)
  function background(v, ms) {
    const c = bgCanvas; c.width = cv.width; c.height = cv.height;
    const b = c.getContext("2d"); b.scale(dpr, dpr);
    // the world between 85° north and south; beyond it, the night sky
    b.fillStyle = css("--bg"); b.fillRect(0, 0, W, H);
    const yN = v.cy + (v.lat - 85) * v.s, yS = v.cy + (v.lat + 85) * v.s;
    b.save(); b.beginPath(); b.rect(0, yN, W, yS - yN); b.clip();
    b.fillStyle = css("--sea"); b.fillRect(0, 0, W, H);
    // every copy of the world that shows (it wraps)
    const copies = []; for (let k = -2; k <= 2; k++) { const x0 = v.cx + (-180 - v.lon + k * 360) * v.s; if (x0 - 30 * v.s < W && x0 + 390 * v.s > 0) copies.push(k * 360); }   // (a little over: coasts reach past the date line)
    const at = (lat, lon, o) => [v.cx + (lon + o - v.lon) * v.s, v.cy + (v.lat - lat) * v.s];
    b.strokeStyle = css("--grid"); b.lineWidth = 1;
    for (const o of copies) for (let lon = -180; lon < 180; lon += 30) { const [x] = at(0, lon, o); b.beginPath(); b.moveTo(x, 0); b.lineTo(x, H); b.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const [, y] = at(lat, 0, 0); b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); }
    // each copy filled on its own, so where two copies overlap they don't cancel out
    b.fillStyle = css("--land"); b.strokeStyle = css("--coast"); b.lineWidth = .8;
    for (const o of copies) {
      b.beginPath();
      for (const r of rings) { for (let i = 0; i < r.length; i += 2) { const [x, y] = at(r[i + 1], r[i], o); i ? b.lineTo(x, y) : b.moveTo(x, y); } b.closePath(); }
      b.fill("evenodd"); b.stroke();
    }
    // night: where the sun's below the horizon now
    const t = new Date(), day = (Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - Date.UTC(t.getUTCFullYear(), 0, 0)) / 864e5;
    const dec = -23.44 * Math.cos((2 * Math.PI / 365) * (day + 10)) * Math.PI / 180;
    const sunLon = -((t.getUTCHours() + t.getUTCMinutes() / 60) - 12) * 15;
    const pole = dec > 0 ? -90 : 90;
    for (const o of copies) {
      b.beginPath();
      for (let lon = -180; lon <= 180; lon += 2) {
        const lat = Math.atan(-Math.cos((lon - sunLon) * Math.PI / 180) / Math.tan(dec || 1e-6)) * 180 / Math.PI;
        const [x, y] = at(lat, lon, o); lon === -180 ? b.moveTo(x, y) : b.lineTo(x, y);
      }
      const [xe, ye] = at(pole, 180, o), [xs] = at(pole, -180, o); b.lineTo(xe, ye); b.lineTo(xs, ye); b.closePath();
      b.fillStyle = css("--night"); b.fill();
    }
    b.restore();
    // where they've been: a fading line back along each trail (under the dots, drawn over it every frame)
    b.lineCap = b.lineJoin = "round";
    for (const p of ms) {
      if (!p.tr?.length) continue;
      const c = kc(p.k), pts = [[p.x, p.y]];
      let lon = p.lon;
      for (const [la, lo] of p.tr) { let d = lo - lon; d -= Math.round(d / 360) * 360; lon += d; pts.push([pts.at(-1)[0] + d * v.s, v.cy + (v.lat - la) * v.s]); }
      const [ex, ey] = pts.at(-1), grad = b.createLinearGradient(p.x, p.y, ex, ey);
      grad.addColorStop(0, c + "aa"); grad.addColorStop(1, c + "00");
      b.strokeStyle = grad; b.lineWidth = 2;
      b.beginPath(); b.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; b.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2); }
      b.lineTo(ex, ey); b.stroke();
    }
    return c;
  }
  function draw(now = performance.now()) {
    if (!W) return;
    const v = view(), same = bv && bv.s === v.s && bv.cx === v.cx && bv.cy === v.cy && bv.lon === v.lon && bv.lat === v.lat;
    // (the dots worked out again only when the view or the dots change)
    const key = `${v.s},${v.cx},${v.cy},${v.lon},${v.lat},${when}`;
    if (key !== mk) { mk = key; marks = merge(v); }
    if (!base || (!same && now - movedAt > 150)) { base = background(v, marks); bv = v; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (base && bv === v || same) g.drawImage(base, 0, 0);
    else {
      // moving: the last picture, moved and scaled to where the map is now (the edges it uncovers in the night's colour)
      const a = v.s / bv.s, tx = v.cx - a * bv.cx + (bv.lon - v.lon) * v.s, ty = v.cy - a * bv.cy + (v.lat - bv.lat) * v.s;
      g.fillStyle = KC.bg ||= css("--bg"); g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(a, 0, 0, a, tx * dpr, ty * dpr); g.drawImage(base, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.scale(dpr, dpr);
    const pulse = STILL.matches ? 0 : (Math.sin(now / 700) + 1) / 2;
    for (const p of marks) {
      const { x, y } = p, c = kc(p.k), r = p.n > 1 ? 5 : 4, gr = r * (3.4 + pulse * .8);
      g.drawImage(glowOf(p.k), x - gr, y - gr, gr * 2, gr * 2);
      g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      // which way it's going: a small arrowhead ahead of it
      const a = { north: 0, "north-east": 45, east: 90, "south-east": 135, south: 180, "south-west": 225, west: 270, "north-west": 315 }[p.h] * Math.PI / 180;
      if (p.h) {
        g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = c;
        g.beginPath(); g.moveTo(0, -r - 7); g.lineTo(-3.2, -r - 2); g.lineTo(3.2, -r - 2); g.closePath(); g.fill(); g.restore();
      }
      // several in the same square: "×2" beside the dot
      if (p.n > 1) { g.font = "700 11px -apple-system, system-ui, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle"; g.lineWidth = 3; g.strokeStyle = "#060b16"; g.strokeText(`×${p.n}`, x + r + 4, y + 1); g.fillStyle = c; g.fillText(`×${p.n}`, x + r + 4, y + 1); }
      if (hover && p.key === hover.key) { g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 3, 0, 7); g.stroke(); }
    }
    // a new minute's dots: the last picture fades out over them, so none of them jumps (not while it's moved, which would smear it)
    if (fadeFrom) {
      const f = (now - fadeAt) / (STILL.matches ? 200 : 600);        // (a cross-fade, quicker, with Reduce Motion too)
      if (f >= 1 || !same) fadeFrom = null;
      else { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1 - f; g.drawImage(fadeFrom, 0, 0); g.globalAlpha = 1; }
    }
  }
  // a frame, and another after it while anything's still changing (always, for the pulse, unless Reduce Motion; the
  // slow pulse alone needs only every other frame)
  let drawnAt = 0;
  const frame = () => { if (!req) req = requestAnimationFrame((t) => {
    req = 0; const busy = fadeFrom || glide || performance.now() - movedAt < 300;
    if (busy || t - drawnAt >= 30 || STILL.matches) { drawnAt = t; draw(t); }
    if (!STILL.matches || busy) frame();
  }); };
  STILL.addEventListener?.("change", () => frame());               // (Reduce Motion turned off while it's open: the pulse starts again)
  // dots of a kind that touch at this zoom drawn as one, "×n" (headings kept only when they agree)
  function merge(v) {
    const out = [];
    for (const p of shown) {
      const [x, y] = xy(p.lat, p.lon, v);
      const m = out.find((o) => o.k === p.k && Math.hypot(o.x - x, o.y - y) < 11);
      if (!m) { out.push({ x, y, k: p.k, n: p.n, h: p.h, lon: p.lon, tr: p.tr, over: { [p.over]: p.n }, key: `${p.k}|${p.lat}|${p.lon}` }); continue; }
      m.x = (m.x * m.n + x * p.n) / (m.n + p.n); m.y = (m.y * m.n + y * p.n) / (m.n + p.n); m.n += p.n;
      if (m.h !== p.h) m.h = null; m.over[p.over] = (m.over[p.over] || 0) + p.n;
    }
    for (const m of out) m.where = Object.entries(m.over).sort((a, b) => b[1] - a[1])[0][0];
    return out;
  }

  // the same grid square, kind and heading drawn as one dot with a number
  function group(list) {
    const m = new Map();
    for (const p of list) { const k = `${p.lat},${p.lon},${p.k},${p.h}`; const o = m.get(k); o ? o.n++ : m.set(k, { ...p, n: 1 }); }
    return [...m.values()];
  }
  function panel() {
    const ps = data?.pigeons || [], n = data?.inAir ?? 0;
    $(".tk-n").textContent = n.toLocaleString("en-GB");
    $(".tk-nlabel").textContent = n === 1 ? "pigeon in the air" : "pigeons in the air";
    const by = Object.fromEntries(KINDS.map(([k]) => [k, 0])); for (const p of ps) by[p.k] = (by[p.k] || 0) + 1;
    const kinds = $(".tk-kinds"); kinds.innerHTML = KINDS.map(([k, name]) => `<div class="tk-kind" data-k="${k}"><span class="tk-dot"></span>${name}<b>${by[k]}</b></div>`).join("");
    kinds.querySelectorAll(".tk-kind").forEach((el) => el.querySelector(".tk-dot").style.setProperty("--c", css(`--k-${el.dataset.k}`)));
    const where = new Map(); for (const p of ps) where.set(p.over, (where.get(p.over) || 0) + 1);
    const top = [...where].sort((a, b) => b[1] - a[1]).slice(0, 7);
    $(".tk-where").innerHTML = top.length ? top.map(([w, c]) => `<li><span>Over ${esc(w)}</span><b>${c}</b></li>`).join("") : `<li class="none">None out in the open right now.</li>`;
    // today, as totals
    // the Moon's: only how many (off the map: they're in space)
    $(".tk-moon").hidden = !data?.moon; $(".tk-moonn").textContent = (data?.moon || 0).toLocaleString("en-GB");
    $(".tk-moonl").textContent = "out in space: to the Moon, Mars or round the Earth";
    const td = data?.today;
    if (td) {
      const mi = Math.round((td.km * 0.621371) / 10) * 10;
      $(".tk-landed").textContent = td.landed.toLocaleString("en-GB");
      $(".tk-flown").textContent = `${mi.toLocaleString("en-GB")} mi`;
      $(".tk-seas").textContent = td.seas.length.toLocaleString("en-GB");
      const names = td.seas.length ? `Over ${td.seas.slice(0, 12).join(", ")}${td.seas.length > 12 ? ` and ${td.seas.length - 12} more` : ""}` : "None yet today";
      $(".tk-seas-stat").title = names; $(".tk-seas-stat").setAttribute("aria-label", `${td.seas.length} seas crossed today. ${names}`);
      $(".tk-today").hidden = false;
    }
    cv.setAttribute("aria-label", `World map: ${ps.length} pigeons shown${top.length ? `, most over ${top.slice(0, 3).map(([w]) => w).join(", ")}` : ""}`);
  }
  function ago() {
    const live = $(".tk-live");
    if (!when) { $(".tk-when").textContent = failed ? "Can’t reach InFlight right now" : "Looking for pigeons…"; live.classList.toggle("off", failed); return; }
    const s = Math.max(0, Math.round((Date.now() - when) / 1000));
    $(".tk-when").textContent = failed ? `Offline · last seen ${Math.round(s / 60)} min ago` : s < 10 ? "Live · just now" : s < 90 ? `Live · ${s} s ago` : `Live · ${Math.round(s / 60)} min ago`;
    live.classList.toggle("off", failed);
  }
  async function load() {
    try {
      const r = await fetch("/api/pigeon/tracker", { credentials: "omit", cache: "no-cache", referrerPolicy: "no-referrer" });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      // (only what the page knows how to draw)
      const td = d.today && typeof d.today === "object" ? d.today : null;
      data = { today: td && { landed: Number(td.landed) || 0, km: Number(td.km) || 0, seas: (Array.isArray(td.seas) ? td.seas : []).filter((x) => typeof x === "string").slice(0, 60) },
        inAir: Number(d.inAir) || 0, moon: Math.max(0, Math.floor(Number(d.moon) || 0)), pigeons: (Array.isArray(d.pigeons) ? d.pigeons : []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && NAME[p.k]).slice(0, 5000)
        .map((p) => ({ ...p, tr: (Array.isArray(p.tr) ? p.tr : []).filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).slice(0, 8) })) };
      if (shown.length && cv.width) { const f = fadeFrom || document.createElement("canvas"); f.width = cv.width; f.height = cv.height; f.getContext("2d").drawImage(cv, 0, 0); fadeFrom = f; fadeAt = performance.now(); }
      shown = group(data.pigeons); when = Date.now(); failed = false; base = null; hover = null; tip.hidden = true;
      panel(); frame();
    } catch (_) { failed = true; }
    ago();
  }

  cv.addEventListener("mousemove", (e) => {
    const b = cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top, v = view();
    let best = null, bd = 14;
    for (const p of marks) { const d = Math.hypot(p.x - mx, p.y - my); if (d < bd) { bd = d; best = p; } }
    if (hover?.key !== best?.key) frame();
    hover = best; cv.classList.toggle("hot", !!best);
    if (!best) { tip.hidden = true; return; }
    const { x, y } = best;
    tip.innerHTML = `${best.n > 1 ? `${best.n} ${esc(NAME[best.k].toLowerCase())} pigeons` : `A ${esc(NAME[best.k].toLowerCase())} pigeon`}<small>Over ${esc(best.where)}${best.h ? ` · heading ${esc(best.h)}` : ""}</small>`;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.hidden = false;
  });
  cv.addEventListener("mouseleave", () => { if (hover) frame(); hover = null; tip.hidden = true; });
  // drag to look round the world, scroll or the buttons to zoom
  const moved = () => { movedAt = performance.now(); hover = null; tip.hidden = true; $(".tk-zoom [data-z=reset]").hidden = zoom === 1 && !goal; frame(); };
  // the buttons, the wheel and the arrow keys glide there (the zoom evenly, however far), rather than jumping; at once with Reduce Motion
  const glideTo = (z1, lon1, lat1) => {
    cancelAnimationFrame(glide); glide = 0;
    if (STILL.matches) { zoom = z1; cLon = lon1; cLat = lat1; goal = null; return moved(); }
    const z0 = zoom, lon0 = cLon, lat0 = cLat, t0 = performance.now(); goal = { z: z1, lon: lon1, lat: lat1 };
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 320), e = 1 - (1 - p) ** 3;
      zoom = Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * e); cLon = lon0 + (lon1 - lon0) * e; cLat = lat0 + (lat1 - lat0) * e;
      if (p < 1) glide = requestAnimationFrame(step); else { glide = 0; goal = null; }
      moved();
    };
    glide = requestAnimationFrame(step);
  };
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { cancelAnimationFrame(glide); glide = 0; goal = null; drag = { x: e.clientX, y: e.clientY, lon: cLon, lat: cLat }; cv.setPointerCapture(e.pointerId); cv.classList.add("drag"); });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; const s = view().s; cLon = drag.lon - (e.clientX - drag.x) / s; cLat = drag.lat + (e.clientY - drag.y) / s; moved(); });
  const end = () => { drag = null; cv.classList.remove("drag"); };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  const zoomBy = (f) => { const t = goal || { z: zoom, lon: cLon, lat: cLat }; glideTo(Math.min(6, Math.max(1, t.z * f)), t.lon, t.lat); };
  cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  $(".tk-zoom").addEventListener("click", (e) => {
    const z = e.target.closest("[data-z]")?.dataset.z; if (!z) return;
    if (z === "reset") { glideTo(1, 15, 22); $(".tk-zoom [data-z=out]").focus(); } else zoomBy(z === "in" ? 1.5 : 1 / 1.5);
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("a, button")) return;
    const t = goal || { z: zoom, lon: cLon, lat: cLat }, step = 120 / view().s;
    if (e.key === "ArrowLeft") glideTo(t.z, t.lon - step, t.lat); else if (e.key === "ArrowRight") glideTo(t.z, t.lon + step, t.lat);
    else if (e.key === "ArrowUp") glideTo(t.z, t.lon, t.lat + step); else if (e.key === "ArrowDown") glideTo(t.z, t.lon, t.lat - step);
    else if (e.key === "+" || e.key === "=") zoomBy(1.5); else if (e.key === "-") zoomBy(1 / 1.5); else return;
    e.preventDefault();
  });
  addEventListener("resize", size);
  STILL.addEventListener?.("change", frame);
  size();
  load(); setInterval(load, EVERY); setInterval(ago, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - when > EVERY) load(); });
}
