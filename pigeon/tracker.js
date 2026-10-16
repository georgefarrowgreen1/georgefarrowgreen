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
    return a;
  });
  let data = null, shown = [], marks = [], when = 0, failed = false, W = 0, H = 0, dpr = 1, base = null, hover = null;
  // where the map looks (it wraps round the world): its middle, and how close in
  let cLon = 15, cLat = 22, zoom = 1.5;          // (zoom 1: the whole world)
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
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); base = null; draw();
  }
  // the land, the grid and the night, drawn once a minute (or on resize)
  function background() {
    const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
    const b = c.getContext("2d"), v = view(); b.scale(dpr, dpr);
    // the world between 85° north and south; beyond it, the night sky
    b.fillStyle = css("--bg"); b.fillRect(0, 0, W, H);
    const yN = v.cy + (v.lat - 85) * v.s, yS = v.cy + (v.lat + 85) * v.s;
    b.save(); b.beginPath(); b.rect(0, yN, W, yS - yN); b.clip();
    b.fillStyle = css("--sea"); b.fillRect(0, 0, W, H);
    // every copy of the world that shows (it wraps)
    const copies = []; for (let k = -2; k <= 2; k++) { const x0 = v.cx + (-180 - v.lon + k * 360) * v.s; if (x0 < W && x0 + 360 * v.s > 0) copies.push(k * 360); }
    const at = (lat, lon, o) => [v.cx + (lon + o - v.lon) * v.s, v.cy + (v.lat - lat) * v.s];
    b.strokeStyle = css("--grid"); b.lineWidth = 1;
    for (const o of copies) for (let lon = -180; lon < 180; lon += 30) { const [x] = at(0, lon, o); b.beginPath(); b.moveTo(x, 0); b.lineTo(x, H); b.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const [, y] = at(lat, 0, 0); b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); }
    b.beginPath();
    for (const o of copies) for (const r of rings) { for (let i = 0; i < r.length; i += 2) { const [x, y] = at(r[i + 1], r[i], o); i ? b.lineTo(x, y) : b.moveTo(x, y); } b.closePath(); }
    b.fillStyle = css("--land"); b.fill("evenodd"); b.strokeStyle = css("--coast"); b.lineWidth = .8; b.stroke();
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
    return c;
  }
  function draw(now = performance.now()) {
    if (!W) return;
    base ||= background();
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(base, 0, 0); g.scale(dpr, dpr);
    const v = view(), pulse = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : (Math.sin(now / 700) + 1) / 2;
    marks = merge(v);
    for (const p of marks) {
      const { x, y } = p, c = css(`--k-${p.k}`) || css("--k-standard"), r = p.n > 1 ? 5 : 4;
      const glow = g.createRadialGradient(x, y, 0, x, y, r * 4); glow.addColorStop(0, c + "66"); glow.addColorStop(1, c + "00");
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, r * (3.4 + pulse * .8), 0, 7); g.fill();
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
  }
  const loop = (t) => { draw(t); requestAnimationFrame(loop); };
  // dots of a kind that touch at this zoom drawn as one, "×n" (headings kept only when they agree)
  function merge(v) {
    const out = [];
    for (const p of shown) {
      const [x, y] = xy(p.lat, p.lon, v);
      const m = out.find((o) => o.k === p.k && Math.hypot(o.x - x, o.y - y) < 11);
      if (!m) { out.push({ x, y, k: p.k, n: p.n, h: p.h, over: { [p.over]: p.n }, key: `${p.k}|${p.lat}|${p.lon}` }); continue; }
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
    $(".tk-shown").textContent = n ? `${ps.length.toLocaleString("en-GB")} shown here. The rest are near home, resting or kept private.` : "";
    const by = Object.fromEntries(KINDS.map(([k]) => [k, 0])); for (const p of ps) by[p.k] = (by[p.k] || 0) + 1;
    const kinds = $(".tk-kinds"); kinds.innerHTML = KINDS.map(([k, name]) => `<div class="tk-kind" data-k="${k}"><span class="tk-dot"></span>${name}<b>${by[k]}</b></div>`).join("");
    kinds.querySelectorAll(".tk-kind").forEach((el) => el.querySelector(".tk-dot").style.setProperty("--c", css(`--k-${el.dataset.k}`)));
    const where = new Map(); for (const p of ps) where.set(p.over, (where.get(p.over) || 0) + 1);
    const top = [...where].sort((a, b) => b[1] - a[1]).slice(0, 7);
    $(".tk-where").innerHTML = top.length ? top.map(([w, c]) => `<li><span>Over ${esc(w)}</span><b>${c}</b></li>`).join("") : `<li class="none">None out in the open right now.</li>`;
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
      data = { inAir: Number(d.inAir) || 0, pigeons: (Array.isArray(d.pigeons) ? d.pigeons : []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && NAME[p.k]).slice(0, 5000) };
      shown = group(data.pigeons); when = Date.now(); failed = false; base = null; hover = null; tip.hidden = true;
      panel();
    } catch (_) { failed = true; }
    ago();
  }

  cv.addEventListener("mousemove", (e) => {
    const b = cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top, v = view();
    let best = null, bd = 14;
    for (const p of marks) { const d = Math.hypot(p.x - mx, p.y - my); if (d < bd) { bd = d; best = p; } }
    hover = best; cv.classList.toggle("hot", !!best);
    if (!best) { tip.hidden = true; return; }
    const { x, y } = best;
    tip.innerHTML = `${best.n > 1 ? `${best.n} ${esc(NAME[best.k].toLowerCase())} pigeons` : `A ${esc(NAME[best.k].toLowerCase())} pigeon`}<small>Over ${esc(best.where)}${best.h ? ` · heading ${esc(best.h)}` : ""}</small>`;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.hidden = false;
  });
  cv.addEventListener("mouseleave", () => { hover = null; tip.hidden = true; });
  // drag to look round the world, scroll or the buttons to zoom
  const moved = () => { base = null; hover = null; tip.hidden = true; $(".tk-zoom [data-z=reset]").hidden = zoom === 1; };
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, lon: cLon, lat: cLat }; cv.setPointerCapture(e.pointerId); cv.classList.add("drag"); });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; const s = view().s; cLon = drag.lon - (e.clientX - drag.x) / s; cLat = drag.lat + (e.clientY - drag.y) / s; moved(); });
  const end = () => { drag = null; cv.classList.remove("drag"); };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  const zoomBy = (f) => { zoom = Math.min(6, Math.max(1, zoom * f)); moved(); };
  cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  $(".tk-zoom").addEventListener("click", (e) => {
    const z = e.target.closest("[data-z]")?.dataset.z; if (!z) return;
    if (z === "reset") { zoom = 1; cLon = 15; cLat = 22; moved(); $(".tk-zoom [data-z=out]").focus(); } else zoomBy(z === "in" ? 1.5 : 1 / 1.5);
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("a, button")) return;
    const s = view().s, step = 120 / s;
    if (e.key === "ArrowLeft") cLon -= step; else if (e.key === "ArrowRight") cLon += step; else if (e.key === "ArrowUp") cLat += step; else if (e.key === "ArrowDown") cLat -= step;
    else if (e.key === "+" || e.key === "=") return zoomBy(1.5); else if (e.key === "-") return zoomBy(1 / 1.5); else return;
    e.preventDefault(); moved();
  });
  addEventListener("resize", size);
  size(); requestAnimationFrame(loop);
  load(); setInterval(load, EVERY); setInterval(ago, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - when > EVERY) load(); });
}
