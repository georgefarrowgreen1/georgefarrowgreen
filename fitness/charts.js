// Fitness's charts, drawn as SVG with no library, their colours from the stylesheet's classes (the page's rules allow
// no style written in the markup): a workout's shape in zone colours, fitness and fatigue and form, the plan's weeks,
// a ride's power and heart rate and height, its route, and its best efforts.

import { svg } from "./ui.js";
import { flatten, zoneOf } from "./workouts.js";

const f1 = (v) => Math.round(v * 10) / 10;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// A workout's shape: each step a block as tall as it's hard, in its zone's colour (a ramp slopes). Mini, for a row
// (no labels); else with your FTP marked, its watts (or the share of it) up the side and the minutes along the foot.
// (`W`: how wide it's drawn, in CSS pixels, so its labels come out at their own size)
export function profile(w, { ftp = null, pace = 4, mini = false, label = "", W: width = 340 } = {}) {
  const steps = flatten(w, pace), total = steps.reduce((a, s) => a + s.secs, 0) || 1;
  const W = mini ? 120 : width, H = mini ? 40 : 150, L = mini ? 0 : 34, B = mini ? 0 : 20, T = mini ? 1 : 8;
  const top = Math.max(1.2, ...steps.map((s) => Math.max(s.from, s.to) * 1.08));
  const x = (t) => L + (t / total) * (W - L - 2), y = (v) => H - B - (Math.min(v, top) / top) * (H - B - T);
  const gap = total / (W - L) > 30 ? 0 : 0.6;
  let t = 0, out = "";
  for (const s of steps) {
    const a = s.kind === "free" ? 0.6 : s.from, b = s.kind === "free" ? 0.6 : s.to, x0 = x(t), x1 = Math.max(x0 + 0.6, x(t + s.secs) - gap);
    const z = s.kind === "free" ? "z1" : zoneOf((a + b) / 2).c;
    out += `<path class="${z} blk" d="M${f1(x0)} ${H - B}V${f1(y(Math.max(a, 0.02)))}L${f1(x1)} ${f1(y(Math.max(b, 0.02)))}V${H - B}Z"${s.kind === "rest" || s.kind === "free" ? ' opacity="0.75"' : ""}/>`;
    t += s.secs;
  }
  if (mini) return svg(`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`);
  // (the guides: FTP, and half and one and a half times it; a mark every 10, 15 or 30 minutes)
  let grid = "";
  for (const v of [0.5, 1, 1.5]) {
    if (v > top) continue;
    const lab = ftp ? `${Math.round(v * ftp)}` : `${v * 100}%`;
    grid += `<line class="${v === 1 ? "ftp" : "grid"}" x1="${L}" x2="${W}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text x="${L - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${lab}</text>`;
  }
  const every = (total > 7200 ? 1800 : total > 3600 ? 900 : 600) * (W < 300 ? 2 : 1);
  for (let m = 0; m <= total; m += every) grid += `<text x="${f1(x(m))}" y="${H - 4}" text-anchor="${m === 0 ? "start" : "middle"}">${m === 0 ? "0" : m % 3600 === 0 ? `${m / 3600} h` : m > 3600 ? `${Math.floor(m / 3600)}:${String((m % 3600) / 60).padStart(2, "0")}` : `${m / 60}′`}</text>`;
  return svg(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${out}</svg>`);
}

// Fitness and fatigue as lines, form as bars under them, over the last `days` days
export function fitnessChart(series, { days = 42, W = 340 } = {}) {
  const s = series.slice(-days), H = 190, top = 122, L = 4, R = 28, n = s.length;
  const max = Math.max(20, ...s.map((d) => Math.max(d.ctl, d.atl))) * 1.12;
  const x = (i) => L + (i / (n - 1)) * (W - L - R), y = (v) => top - (v / max) * (top - 8);
  const fb = Math.max(15, ...s.map((d) => Math.abs(d.tsb))), mid = 156, yf = (v) => mid - (v / fb) * 24;
  const line = (k) => s.map((d, i) => `${i ? "L" : "M"}${f1(x(i))} ${f1(y(d[k]))}`).join("");
  const bw = Math.max(1, (W - L - R) / n - (n > 60 ? 0.5 : 1.5));
  let bars = "";
  s.forEach((d, i) => { const v = d.tsb, y0 = yf(Math.max(0, v)), y1 = yf(Math.min(0, v)); bars += `<rect class="${v >= 0 ? "b-up" : "b-down"}" x="${f1(x(i) - bw / 2)}" y="${f1(y0)}" width="${f1(bw)}" height="${f1(Math.max(1, y1 - y0))}" rx="1"/>`; });
  const ticks = [Math.round(max / 2.4 / 10) * 10, Math.round(max / 1.2 / 10) * 10].filter((v) => v > 0);
  let grid = ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text x="${W - R + 6}" y="${f1(y(v) + 4)}">${v}</text>`).join("");
  grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${mid}" y2="${mid}"/><text x="${W - R + 6}" y="${mid + 4}">0</text>`;
  const last = s[n - 1];
  return svg(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fitness ${Math.round(last.ctl)}, fatigue ${Math.round(last.atl)}, form ${Math.round(last.tsb)}, over the last ${days} days">${grid}
    <path class="a-fit" d="${line("ctl")}L${f1(x(n - 1))} ${top}L${f1(x(0))} ${top}Z"/><path class="l-fat" d="${line("atl")}"/><path class="l-fit" d="${line("ctl")}"/>
    <circle class="end-dot" cx="${f1(x(n - 1))}" cy="${f1(y(last.ctl))}" r="4.5"/>${bars}
    <text x="${L}" y="${H - 2}">${days} days ago</text><text x="${W - R}" y="${H - 2}" text-anchor="end">Today</text></svg>`);
}

// The plan's weeks: what each asks (the bar), what's done of it (filled), in its phase's colour; this week ringed
export function planWeeks(weeks, done, now, W = 340) {
  const H = 110, n = weeks.length, gap = n > 12 ? 4 : 6, bw = (W - gap * (n - 1)) / n;
  const max = Math.max(...weeks.map((w) => w.tss), ...done) * 1.08 || 1;
  const cls = { Base: "phase-b", Build: "phase-u", Peak: "phase-p", Taper: "phase-t" };
  let out = "";
  weeks.forEach((w, i) => {
    const x = i * (bw + gap), hp = (w.tss / max) * (H - 26), hd = Math.min(hp, (done[i] / max) * (H - 26));
    out += `<rect class="wk-plan" x="${f1(x)}" y="${f1(H - 20 - hp)}" width="${f1(bw)}" height="${f1(hp)}" rx="4"/>`;
    if (hd > 0) out += `<rect class="${cls[w.phase]}" x="${f1(x)}" y="${f1(H - 20 - hd)}" width="${f1(bw)}" height="${f1(hd)}" rx="4"/>`;
    if (i === now) out += `<rect class="wk-now" x="${f1(x - 2)}" y="${f1(H - 22 - hp)}" width="${f1(bw + 4)}" height="${f1(hp + 4)}" rx="6"/>`;
    if (i === 0 || (i + 1) % 4 === 0 || i === now) out += `<text x="${f1(x + bw / 2)}" y="${H - 4}" text-anchor="middle">${i + 1}</text>`;
  });
  return svg(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Training stress planned each week, and done so far">${out}</svg>`);
}

// A ride over time: its power (smoothed over 10 s) with its height as a shape behind, or its speed where there's no
// power; and under it, its heart rate on a strip of its own. With a cursor, for what each was at a moment.
export function streams(ps, secs, W = 340) {
  const H = 210, B = 18, T = 6, split = 140, n = Math.min(300, Math.round(W)), len = ps.moving.length, per = Math.max(1, Math.ceil(len / n));
  const bucket = (arr, smooth = 1) => {
    if (!arr) return null;
    const out = [];
    for (let i = 0; i < len; i += per) {
      let t = 0, c = 0;
      for (let j = Math.max(0, i - smooth + 1); j < Math.min(len, i + per); j++) if (Number.isFinite(arr[j])) { t += arr[j]; c++; }
      out.push(c ? t / c : null);
    }
    return out;
  };
  const pw = bucket(ps.pwr, 10), hr = bucket(ps.hr), el = bucket(ps.ele), sp = !ps.pwr ? bucket(ps.spd) : null, m = (pw || hr || el || sp).length;
  const x = (i) => (i / (m - 1)) * W;
  // (a value's height in a band: the main one above, the heart rate's strip below)
  const scale = (lo, hi, y0, y1) => (v) => y0 - ((v - lo) / (hi - lo || 1)) * (y0 - y1);
  const path = (arr, yf) => { let d = "", pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${f1(x(i))} ${f1(yf(v))}`; pen = true; }); return d; };
  const vals = (a) => a.filter((v) => v != null);
  const top = hr ? split : H - B;
  let out = "";
  if (el) { const v = vals(el), lo = Math.min(...v), hi = Math.max(...v), yf = scale(lo - (hi - lo) * 0.25, hi, top, T + (top - T) * 0.35); out += `<path class="a-ele" d="${path(el, yf)}L${W} ${top}L0 ${top}Z"/>`; }
  if (pw) {
    const mx = Math.max(...vals(pw)) * 1.08, yf = scale(0, mx, top, T);
    out += `<path class="a-pwr" d="${path(pw, yf)}L${W} ${top}L0 ${top}Z"/><path class="s-pwr" d="${path(pw, yf)}"/>`;
    const tick = Math.round(mx / 2 / 50) * 50;
    if (tick) out += `<line class="grid" x1="0" x2="${W}" y1="${f1(yf(tick))}" y2="${f1(yf(tick))}"/><text x="2" y="${f1(yf(tick) - 4)}">${tick} W</text>`;
  }
  if (sp) { const yf = scale(0, Math.max(...vals(sp)) * 1.1, top, T); out += `<path class="s-spd" d="${path(sp, yf)}"/>`; }
  if (hr) {
    const v = vals(hr), lo = Math.min(...v), hi = Math.max(...v), yf = scale(lo - 2, hi + 2, H - B, split + 12);
    out += `<line class="grid" x1="0" x2="${W}" y1="${split + 6}" y2="${split + 6}"/><path class="s-hr" d="${path(hr, yf)}"/><text x="2" y="${H - B - 4}">${Math.round(lo)}–${Math.round(hi)} bpm</text>`;
  }
  const every = (secs > 7200 ? 1800 : secs > 2400 ? 900 : 300) * (W < 300 ? 2 : 1);
  for (let s = every; s < secs - every / 3; s += every) out += `<text x="${f1((s / len) * W)}" y="${H - 3}" text-anchor="middle">${s >= 3600 ? `${Math.floor(s / 3600)}:${String((s % 3600) / 60).padStart(2, "0")}` : `${s / 60}′`}</text>`;
  out += `<line class="cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  return svg(`<svg class="chart scrub" viewBox="0 0 ${W} ${H}" role="img" aria-label="Power, heart rate and height through the ride">${out}</svg>`);
}

// The route, on a plain pane: drawn to scale (a degree of longitude narrower the further north), each stretch in the
// zone of the power there (or plain, without power), with where it started and finished. Returns the picture and a
// function that places a marker at a sample.
export function route(s, zoneAt, W = 340, metric = true) {
  const H = Math.round(W * 0.62), P = 18, pts = [];
  for (let i = 0; i < s.t.length; i++) if (s.lat[i] != null && s.lon[i] != null) pts.push(i);
  const lat0 = s.lat[pts[0]], k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((i) => s.lon[i] * k), ys = pts.map((i) => -s.lat[i]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min((W - P * 2) / (maxX - minX || 1e-6), (H - P * 2) / (maxY - minY || 1e-6));
  const ox = (W - (maxX - minX) * sc) / 2, oy = (H - (maxY - minY) * sc) / 2;
  const X = (j) => ox + (xs[j] - minX) * sc, Y = (j) => oy + (ys[j] - minY) * sc;
  // (a stretch at a time, a new one where the zone changes; about 600 points in all)
  const stepN = Math.max(1, Math.floor(pts.length / 600));
  let segs = "", cur = null, d = "";
  for (let j = 0; j < pts.length; j += stepN) {
    const z = zoneAt ? zoneAt(pts[j]) : "z2";
    const p = `${f1(X(j))} ${f1(Y(j))}`;
    if (z !== cur) { if (d) segs += `<path class="route st-${cur}" d="${d}L${p}"/>`; d = `M${p}`; cur = z; } else d += `L${p}`;
  }
  if (d) segs += `<path class="route st-${cur}" d="${d}"/>`;
  const all = pts.filter((_, j) => j % stepN === 0).map((_, jj) => `${jj ? "L" : "M"}${f1(X(jj * stepN))} ${f1(Y(jj * stepN))}`).join("");
  // (a scale: a round distance about a fifth of the width, in metres per unit across)
  const mPerUnit = 111195 / sc, target = (W / 5) * mPerUnit, unit = metric ? 1 : 1609.344;
  const nice = ([0.5, 1, 2, 5, 10, 20, 50].map((v) => v * (metric ? 1000 : unit)).find((v) => v >= target * 0.6) || 50 * unit), bar = nice / mPerUnit;
  const scaleText = (m) => (metric ? (m >= 1000 ? `${m / 1000} km` : `${m} m`) : `${Math.round((m / unit) * 10) / 10} mi`);
  let grid = "";
  for (let gx = 40; gx < W; gx += 40) grid += `<line class="gridline" x1="${gx}" x2="${gx}" y1="0" y2="${H}"/>`;
  for (let gy = 40; gy < H; gy += 40) grid += `<line class="gridline" x1="0" x2="${W}" y1="${gy}" y2="${gy}"/>`;
  const last = pts.length - 1;
  const el = svg(`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The route">${grid}<path class="route-under" d="${all}"/>${segs}
    <circle class="pin-end" cx="${f1(X(last))}" cy="${f1(Y(last))}" r="6"/><circle class="pin-start" cx="${f1(X(0))}" cy="${f1(Y(0))}" r="6"/>
    <circle class="pin-here" r="7" cx="0" cy="0" visibility="hidden"/>
    <line class="cursor" x1="12" x2="${f1(12 + bar)}" y1="${H - 12}" y2="${H - 12}" stroke-width="2"/><text class="scale-t" x="${f1(16 + bar)}" y="${H - 8}">${scaleText(nice)}</text></svg>`);
  const here = el.querySelector(".pin-here");
  // (the sample nearest a time, among those with a place)
  const at = (sample) => {
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid] < sample) lo = mid + 1; else hi = mid; }
    if (sample == null) { here.setAttribute("visibility", "hidden"); return; }
    here.setAttribute("cx", f1(X(lo))); here.setAttribute("cy", f1(Y(lo))); here.setAttribute("visibility", "visible");
  };
  return { el, at };
}

// Best efforts: the most held for 5 seconds to an hour, along a stretched time line (seconds count less as they add up)
export function curve(best, ftp, W = 340) {
  const ds = Object.keys(best).map(Number), H = 170, L = 36, B = 20, T = 10;
  if (ds.length < 2) return null;
  const lx = (d) => Math.log(d), x0 = lx(ds[0]), x1 = lx(3600), max = Math.max(...Object.values(best), ftp) * 1.1;
  const x = (d) => L + ((lx(d) - x0) / (x1 - x0)) * (W - L - 8), y = (v) => H - B - (v / max) * (H - B - T);
  const d = ds.map((s, i) => `${i ? "L" : "M"}${f1(x(s))} ${f1(y(best[s]))}`).join("");
  let grid = "";
  for (const v of [Math.round(ftp / 2 / 50) * 50, ftp, Math.round((ftp * 1.6) / 50) * 50]) if (v < max) grid += `<line class="${v === ftp ? "ftp" : "grid"}" x1="${L}" x2="${W}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text x="${L - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${v}</text>`;
  for (const [s, lab] of [[5, "5 s"], [60, "1 min"], [300, "5 min"], [1200, "20 min"], [3600, "1 h"]]) grid += `<text x="${f1(x(s))}" y="${H - 4}" text-anchor="middle">${lab}</text>`;
  const dots = ds.map((s) => `<circle class="curve-dot" cx="${f1(x(s))}" cy="${f1(y(best[s]))}" r="3.5"/>`).join("");
  return svg(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Best efforts: ${ds.map((s) => `${s < 60 ? s + " seconds" : s / 60 + " minutes"} ${best[s]} watts`).join(", ")}">${grid}
    <path class="curve-a" d="${d}L${f1(x(ds[ds.length - 1]))} ${H - B}L${f1(x(ds[0]))} ${H - B}Z"/><path class="curve" d="${d}"/>${dots}</svg>`);
}

// Weather's picture for a fair day (its sun and cloud, as its icon has them), for the best time to ride
export const weatherIcon = () => svg(`<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><defs><linearGradient id="wxs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f97f8"/><stop offset="1" stop-color="#2b69de"/></linearGradient></defs>
  <rect width="48" height="48" fill="url(#wxs)"/><circle cx="17" cy="19" r="8.5" fill="#ffc93c"/><path d="M35 36H18a7 7 0 0 1-1.5-13.8 9 9 0 0 1 17.4 1A6.5 6.5 0 0 1 35 36z" fill="#fff" fill-opacity="0.9"/></svg>`);
