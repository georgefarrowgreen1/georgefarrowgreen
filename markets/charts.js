// Markets's charts: a line through the prices, smooth, drawn in as it first shows; morphed point by point into the next
// range's (so 1D to 5Y reshapes rather than jumps); and read with a finger (or the pointer) along it, the price and time
// where you are. Every one is SVG, drawn to the width it's shown at.

const SVGNS = "http://www.w3.org/2000/svg";
export const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// (a style set as the page's own, never as an attribute: its rules allow no inline ones)
export const el = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) k === "style" ? (e.style.cssText = v) : e.setAttribute(k, v); return e; };

// n points, evenly along the line through vals (so two charts of different lengths morph one into the other)
export function resample(vals, n) {
  if (!vals.length) return Array(n).fill(0);
  if (vals.length === 1) return Array(n).fill(vals[0]);
  const out = [];
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * (vals.length - 1), a = Math.floor(x), b = Math.min(vals.length - 1, a + 1); out.push(vals[a] + (vals[b] - vals[a]) * (x - a)); }
  return out;
}
// the points on a w × h drawing (xs: each one's place across, 0 to 1; by default evenly spaced), the range padded so the
// line never touches the edge; with the baseline's height, where one's given
export function place(vals, w, h, { pad = 12, xs = null, base = null } = {}) {
  const all = base != null ? [...vals, base] : vals, lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || Math.abs(hi) * 0.01 || 1;
  const y = (v) => pad + (h - 2 * pad) * (1 - (v - lo) / span);
  return { pts: vals.map((v, i) => [(xs ? xs[i] : vals.length > 1 ? i / (vals.length - 1) : 0.5) * w, y(v)]), baseY: base != null ? y(base) : null };
}
// a smooth line through them (each corner rounded through its neighbours' midpoints)
export function smooth(p) {
  if (!p.length) return "";
  let s = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) { const [x0, y0] = p[i - 1], [x1, y1] = p[i]; s += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`; }
  const l = p[p.length - 1];
  return `${s} L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
}
export const area = (p, h) => (p.length ? `${smooth(p)} L${p[p.length - 1][0].toFixed(1)} ${h} L${p[0][0].toFixed(1)} ${h} Z` : "");

// drawn in along its length, after `delay` seconds
export function drawIn(path, delay = 0, secs = 1.4) {
  if (still() || !path?.getTotalLength) return;
  const L = path.getTotalLength();
  if (!L) return;
  path.style.transition = "none"; path.style.strokeDasharray = `${L}`; path.style.strokeDashoffset = `${L}`;
  path.getBoundingClientRect();
  path.style.transition = `stroke-dashoffset ${secs}s cubic-bezier(.22,1,.36,1) ${delay}s`;
  path.style.strokeDashoffset = "0";
  setTimeout(() => { path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; path.style.transition = ""; }, (delay + secs) * 1000 + 60);
}
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
// from one set of points to another (the same number of each), in `ms`: step(pts) each frame
export function tween(from, to, ms, step) {
  if (still() || !from || from.length !== to.length) { step(to); return Promise.resolve(); }
  return new Promise((done) => {
    const t0 = performance.now();
    const frame = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = ease(k);
      step(from.map((p, i) => [p[0] + (to[i][0] - p[0]) * e, p[1] + (to[i][1] - p[1]) * e]));
      if (k < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
}
// a number counted from one value to another: render(v) each frame
export function count(from, to, ms, render) {
  if (still() || from === to || from == null) { render(to); return; }
  const t0 = performance.now();
  const frame = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4); render(from + (to - from) * e); if (k < 1) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}
// a sparkline: its path, on a w × h drawing
export function spark(vals, w, h, base = null) {
  if (!vals || vals.length < 2) return "";
  return smooth(place(resample(vals, Math.min(vals.length, 40)), w, h, { pad: 3, base }).pts);
}

// Read along a chart: the line under the finger, a dot on it and what it says there. at(x) → { x, y, label } for a place
// across the box (in its own pixels), or null
export function scrubber(box, at) {
  const line = document.createElement("i"), dot = document.createElement("i"), tip = document.createElement("span");
  line.className = "scrub-line"; dot.className = "scrub-dot"; tip.className = "scrub-tip num";
  box.append(line, dot, tip);
  let on = false;
  const show = (e) => {
    const r = box.getBoundingClientRect(), got = at(Math.max(0, Math.min(r.width, e.clientX - r.left)), r.width);
    if (!got) return;
    if (!on) { on = true; box.classList.add("scrubbing"); }
    line.style.transform = `translateX(${got.x}px)`;
    dot.style.transform = `translate(${got.x}px, ${got.y}px)`;
    tip.textContent = got.label;
    // (kept on the chart: held in by half its own width)
    const half = Math.min(r.width / 2, (tip.offsetWidth || 112) / 2 + 4);
    tip.style.transform = `translateX(${Math.max(half, Math.min(r.width - half, got.x))}px) translateX(-50%)`;
  };
  const end = () => { on = false; box.classList.remove("scrubbing"); };
  box.addEventListener("pointerdown", (e) => { show(e); if (e.pointerType !== "mouse") box.setPointerCapture?.(e.pointerId); });
  box.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || on) show(e); });
  box.addEventListener("pointerleave", end);
  box.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") end(); });
  box.addEventListener("pointercancel", end);
}
