// Charts, drawn as SVG: one measure per chart, on one axis. A crosshair and a
// readout follow your finger (or the arrow keys), and a table of the same
// numbers is there for screen readers.

const NS = "http://www.w3.org/2000/svg";
const HOUR = 3600e3;

function niceStep(range, want) {
  const raw = range / Math.max(1, want), p = 10 ** Math.floor(Math.log10(raw || 1)), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
export function niceScale(lo, hi, want = 3, pad = 0) {
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  lo -= pad; hi += pad;
  const step = niceStep(hi - lo, want), a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
  for (let v = a; v <= b + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo: a, hi: b, ticks };
}
const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
// a column with a 4px rounded top, square at the baseline
function colPath(x, y, w, h, r = 4) {
  r = Math.min(r, w / 2, h);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}z`;
}

/**
 * A chart over time, into `host`:
 *   kind      "line" | "columns"
 *   points    [{ t, v, lo?, hi? }]   (lo/hi: a shaded range around the line)
 *   color     the series' colour
 *   y         { min?, max?, ticks?, fmt(v), inside? }   (fixed ends, or worked out from the data; inside: each
 *             label names the band under its line, in the chart at the end, rather than beside it)
 *   x         { hour(t), day(t), step }          (labels for hours and for the start of each day)
 *   now       a time to mark "Now"
 *   nights    [[from, to]]              (shaded softly)
 *   marks     [{ t, v, text }]          (a few direct labels; over columns, those that fit, the first first)
 *   tip(p)    → { title, rows: [[value, label]] }
 *   summary   what the chart shows, for screen readers
 *   table     { head: [..], rows: [[..]] }
 *   key       what it shows (a place, a view): a new one draws in; the same one, redrawn or refreshed, doesn't
 */
export function timeChart(host, opts) {
  const fresh = !host._chart || (opts.key ?? null) !== (host._chart.key ?? null);
  host._chart = opts;
  // (its width kept as it changes, rather than measured each time it's drawn: that would lay the page out again then and
  // there, each chart in turn, as the forecast's parts come in)
  if (!host._ro && typeof ResizeObserver !== "undefined") {
    host._ro = new ResizeObserver(() => { const w = host.clientWidth, was = host._w ?? 0; host._w = w; seen(host, w); if (Math.abs(w - was) > 2) draw(host); });
    host._ro.observe(host);
  }
  draw(host, fresh);
}
// A chart's width before it's been laid out: as it was last time at this window's width (kept), else a guess from the
// window's; not measured then and there, which would lay the whole page out mid-way through drawing it, once for each
// chart. Its ResizeObserver says the real width once the page is laid out (before it's shown), and if that's another,
// it's drawn again to it
const KEEP = "wx:chartw";
let widths = {};
try { widths = JSON.parse(localStorage.getItem(KEEP) || "{}") || {}; } catch (_) {}
const whose = (host) => `${innerWidth}|${host.id || host.closest?.("[id]")?.id || ""}`;
// (the guess: a card's inside on a phone, the window less 68; on a wide screen, two columns, 1.15 to 1 (styles.css))
const guessW = (host) => {
  if (widths[whose(host)]) return widths[whose(host)];
  if (innerWidth < 980) return innerWidth - 68;
  const both = Math.min(innerWidth, 1180) - 54;
  return Math.round((both * (host.closest?.(".col-b") ? 1 : 1.15)) / 2.15) - 36;
};
function seen(host, w) {
  const k = whose(host);
  if (!w || widths[k] === w) return;
  widths[k] = w;
  const ks = Object.keys(widths);
  for (const x of ks.slice(0, Math.max(0, ks.length - 30))) delete widths[x];
  try { localStorage.setItem(KEEP, JSON.stringify(widths)); } catch (_) {}
}

// Drawing in: the line traced from the left, its range fading in behind, columns growing from the baseline
// one after another, the labels last (styles.css, .c-enter). Started once the chart's on screen, so it's seen.
const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)");
const waiting = new WeakMap();
const watch = typeof IntersectionObserver === "function" && new IntersectionObserver((es) => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    watch.unobserve(e.target);
    waiting.get(e.target)?.classList.add("c-enter");
    waiting.delete(e.target);
    e.target._enterAt = performance.now();
  }
}, { threshold: 0.3 });
function enter(host, svg) {
  if (still?.matches) return;
  const r = host.getBoundingClientRect();
  if (!watch || (r.bottom > 0 && r.top < innerHeight - 40)) { svg.classList.add("c-enter"); host._enterAt = performance.now(); return; }
  waiting.set(host, svg); watch.observe(host);
}
// drawn again (more of the forecast in, a new size) while it's still drawing in: it carries on from there
function carryOn(host, svg) {
  if (waiting.has(host)) { waiting.set(host, svg); return; }
  const gone = performance.now() - (host._enterAt ?? -1e9);
  if (gone < 1600) { svg.classList.add("c-enter"); svg.style.setProperty("--t0", `${-Math.round(gone)}ms`); }
}

function draw(host, fresh = false) {
  const o = host._chart; if (!o) return;
  const pts = o.points.filter((p) => p.v != null);
  const W = Math.max(260, (host._w ??= guessW(host)) || 340), Hh = o.height || 170;
  host.replaceChildren();
  host.classList.add("chart");
  if (!pts.length) { host.textContent = "No data"; return; }
  // (inside: the labels in a margin of their own at the end, as wide as the longest, so no column runs under them)
  const gutter = o.y?.inside ? Math.max(...(o.y.ticks || []).map((v) => String(o.y.fmt ? o.y.fmt(v) : v).length)) * 6.4 + 12 : 0;
  // (columns with labels over them: a row more above them, so one over a full column can go over Now's too)
  const L = o.y?.inside ? 8 : 34, R = o.y?.inside ? gutter : 10, T = o.kind === "columns" && o.marks ? 30 : 18, B = 26, iw = W - L - R, ih = Hh - T - B;
  const step = o.x?.step || HOUR, cols = o.kind === "columns";
  const t0 = o.points[0].t, t1 = o.points[o.points.length - 1].t + (cols ? step : 0);
  const X = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const vals = pts.flatMap((p) => [p.v, p.lo, p.hi]).filter((v) => v != null);
  const ys = o.y?.ticks ? { lo: o.y.min ?? Math.min(...o.y.ticks), hi: o.y.max ?? Math.max(...o.y.ticks), ticks: o.y.ticks }
    : niceScale(o.y?.min ?? Math.min(...vals), o.y?.max ?? Math.max(...vals), Hh < 130 ? 2 : 3);
  if (o.y?.min != null) ys.lo = o.y.min;
  if (o.y?.max != null) ys.hi = Math.max(o.y.max, ...(o.y?.grow ? vals : []));
  const Y = (v) => T + ih - ((v - ys.lo) / Math.max(1e-9, ys.hi - ys.lo)) * ih;

  const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img", "aria-label": o.summary || "Chart" });
  // the night, softly
  for (const [a, b] of o.nights || []) {
    const xa = Math.max(L, X(a)), xb = Math.min(L + iw, X(b));
    if (xb > xa) svg.append(el("rect", { x: xa, y: T, width: xb - xa, height: ih, class: "c-night" }));
  }
  // gridlines and the y-axis
  const shown = ys.ticks.filter((v) => v >= ys.lo - 1e-9 && v <= ys.hi + 1e-9), inside = [];
  shown.forEach((v, i) => {
    svg.append(el("line", { x1: L, x2: o.y?.inside ? W - 2 : L + iw, y1: Y(v), y2: Y(v), class: "c-grid" }));
    const text = o.y?.fmt ? o.y.fmt(v) : String(v);
    if (o.y?.inside) inside.push([(Y(v) + Y(i ? shown[i - 1] : ys.lo)) / 2, text]);
    else svg.append(el("text", { x: L - 6, y: Y(v) + 3.5, class: "c-ytick", "text-anchor": "end" }, text));
  });
  // the hours along the bottom: a label every few hours, the day's name at midnight; as far apart as the
  // labels need ("8:15pm" more than "20"), and on the clock's own marks (on the hour, the half hour)
  const first = Math.ceil(t0 / step) * step, sample = o.x?.hour ? String(o.x.hour(first + step)) : "00";
  const need = Math.max(34, sample.length * 6.6 + 12), per = iw / ((t1 - t0) / step);
  const every = (step === HOUR ? [1, 2, 3, 4, 6, 12, 24] : [1, 2, 4, 8, 16]).find((n) => per * n >= need) || 24;
  for (let t = first; t < t1 + 1; t += step) {
    const d = new Date(t), h = d.getUTCHours();
    if (step === HOUR && h % every !== 0) continue;
    if (step !== HOUR && Math.round(t / step) % every !== 0) continue;
    const x = X(t) + (cols ? (X(t + step) - X(t)) / 2 : 0);
    if (x < L - 1 || x > L + iw + 1) continue;
    const day = step === HOUR && h === 0 && o.x?.day;
    svg.append(el("text", { x, y: Hh - 8, class: day ? "c-xtick c-day" : "c-xtick", "text-anchor": "middle" }, day ? o.x.day(t) : o.x?.hour ? o.x.hour(t) : String(h)));
    if (day) svg.append(el("line", { x1: X(t), x2: X(t), y1: T, y2: T + ih, class: "c-daysep" }));
  }
  // the data
  if (cols) {
    const slot = iw / ((t1 - t0) / step), w = Math.max(1, Math.min(24, slot - 2));
    let k = 0;
    for (const p of pts) {
      const x = X(p.t) + (slot - w) / 2, y = Y(Math.max(ys.lo, p.v)), h = Y(ys.lo) - y;
      if (h > 0.4) { const c = el("path", { d: colPath(x, y, w, h), fill: p.color || o.color, class: "c-col" }); c.style.setProperty("--k", String(k++)); svg.append(c); }
    }
  } else {
    const band = pts.filter((p) => p.lo != null && p.hi != null);
    if (band.length > 1) {
      const d = band.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.hi).toFixed(1)}`).join("") + band.slice().reverse().map((p) => `L${X(p.t).toFixed(1)} ${Y(p.lo).toFixed(1)}`).join("") + "z";
      svg.append(el("path", { d, fill: o.bandColor || o.color, class: "c-band" }));
    }
    let d = "", gap = true;
    for (const p of o.points) {
      if (p.v == null) { gap = true; continue; }
      d += `${gap ? "M" : "L"}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`; gap = false;
    }
    svg.append(el("path", { d, stroke: o.color, class: "c-line", pathLength: 1 }));
  }
  // now
  if (o.now != null && o.now >= t0 && o.now <= t1) {
    const x = X(o.now);
    svg.append(el("line", { x1: x, x2: x, y1: T - 4, y2: T + ih, class: "c-now" }));
    svg.append(el("text", { x: Math.min(Math.max(x, L + 12), L + iw - 12), y: T - 7, class: "c-nowtext", "text-anchor": "middle" }, "Now"));
  }
  // the y-axis's labels inside the chart: each in the middle of its band, in the margin at the end
  for (const [y, text] of inside) svg.append(el("text", { x: W - 2, y: y + 3.5, class: "c-ytick c-in", "text-anchor": "end" }, text));
  // a few labels, on the marks themselves; over columns, clear of every column under it (above the tallest, up into
  // the margin over the chart if need be, over Now's row if that's in the way), and of Now and each other: one that
  // can't be is left out (the first come first: the caller's most worth saying)
  const taken = [];
  if (o.now != null && o.now >= t0 && o.now <= t1) { const x = Math.min(Math.max(X(o.now), L + 12), L + iw - 12); taken.push([x - 15, x + 15, T - 18, T - 4]); }
  for (const m of o.marks || []) {
    const x = cols ? X(m.t) + (X(m.t + step) - X(m.t)) / 2 : X(m.t), y = Y(m.v);
    if (!cols) {
      svg.append(el("circle", { cx: x, cy: y, r: 4, fill: o.color, class: "c-dot" }));
      const tx = Math.min(Math.max(x, L + 14), L + iw - 14), above = y - T > 16;
      svg.append(el("text", { x: tx, y: above ? y - 9 : y + 17, class: "c-label", "text-anchor": "middle" }, m.text));
      continue;
    }
    const w = String(m.text).length * 6.6 + 4, tx = Math.min(Math.max(x, L + w / 2), L + iw - w / 2);
    const top = Math.max(m.v, ...pts.filter((p) => X(p.t + step) > tx - w / 2 && X(p.t) < tx + w / 2).map((p) => p.v));
    const boxAt = (y) => [tx - w / 2, tx + w / 2, y - 11, y + 2], free = (box) => !taken.some((b) => b[0] < box[1] && box[0] < b[1] && b[2] < box[3] && box[2] < b[3]);
    let by = Math.max(12, Y(top) - 6);
    if (!free(boxAt(by))) { by = 10; if (!free(boxAt(by))) continue; }
    taken.push(boxAt(by));
    svg.append(el("text", { x: tx, y: by, class: "c-label", "text-anchor": "middle" }, m.text));
  }
  // the crosshair and the readout
  const cross = el("g", { class: "c-cross", visibility: "hidden" });
  const cl = el("line", { y1: T, y2: T + ih, class: "c-crossline" }), cd = el("circle", { r: 4.5, class: "c-crossdot", fill: o.color });
  cross.append(cl); if (!cols) cross.append(cd);
  svg.append(cross);
  const hit = el("rect", { x: L, y: 0, width: iw, height: Hh, fill: "transparent", class: "c-hit" });
  svg.append(hit);
  host.append(svg);
  if (fresh) enter(host, svg); else carryOn(host, svg);
  const tip = document.createElement("div");
  tip.className = "c-tip"; tip.hidden = true; tip.setAttribute("aria-hidden", "true");
  host.append(tip);
  // the numbers, for screen readers
  if (o.table) {
    // (in a clipped box: a table won't shrink to the 1px the clip asks of it, and would widen the page)
    const wrap = document.createElement("div"); wrap.className = "sr-only";
    const tb = document.createElement("table");
    const cap = document.createElement("caption"); cap.textContent = o.summary || ""; tb.append(cap);
    const hr = document.createElement("tr"); for (const h of o.table.head) { const th = document.createElement("th"); th.scope = "col"; th.textContent = h; hr.append(th); }
    tb.append(hr);
    for (const r of o.table.rows) { const tr = document.createElement("tr"); for (const c of r) { const td = document.createElement("td"); td.textContent = c; tr.append(td); } tb.append(tr); }
    wrap.append(tb); host.append(wrap);
  }

  let idx = -1;
  const show = (i) => {
    if (i < 0 || i >= pts.length) return hide();
    idx = i;
    const p = pts[i], x = cols ? X(p.t) + (X(p.t + step) - X(p.t)) / 2 : X(p.t);
    cl.setAttribute("x1", x); cl.setAttribute("x2", x); cd.setAttribute("cx", x); cd.setAttribute("cy", Y(p.v));
    cross.setAttribute("visibility", "visible");
    const info = o.tip ? o.tip(p) : { title: "", rows: [[String(p.v), ""]] };
    tip.replaceChildren();
    if (info.title) { const t = document.createElement("div"); t.className = "c-tip-title"; t.textContent = info.title; tip.append(t); }
    for (const [v, label] of info.rows) {
      const row = document.createElement("div"); row.className = "c-tip-row";
      const b = document.createElement("b"); b.textContent = v; const s = document.createElement("span"); s.textContent = label;
      row.append(b, s); tip.append(row);
    }
    tip.hidden = false;
    const tw = tip.offsetWidth || 120, left = Math.min(Math.max(4, x - tw / 2), W - tw - 4);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, T - 6 - (tip.offsetHeight || 40))}px`;
  };
  const hide = () => { idx = -1; cross.setAttribute("visibility", "hidden"); tip.hidden = true; };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect(), x = ((clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const px = cols ? X(p.t) + (X(p.t + step) - X(p.t)) / 2 : X(p.t), dd = Math.abs(px - x); if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  // (a finger or mouse moving: once a frame at most, where layout's already done, and only when it's on another point)
  let near = 0, nearX = 0;
  const to = (i) => { if (i !== idx) show(i); };
  hit.addEventListener("pointermove", (e) => { nearX = e.clientX; near ||= requestAnimationFrame(() => { near = 0; to(nearest(nearX)); }); });
  hit.addEventListener("pointerdown", (e) => to(nearest(e.clientX)));
  hit.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
  host.tabIndex = 0;
  host.onkeydown = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const start = idx < 0 ? Math.max(0, pts.findIndex((p) => p.t >= (o.now ?? t0))) : idx + (e.key === "ArrowRight" ? 1 : -1);
      show(Math.max(0, Math.min(pts.length - 1, start)));
    } else if (e.key === "Escape") hide();
  };
  host.onblur = hide;
}

/**
 * Where a value sits in its usual range (a horizontal band): today's high against this time of year.
 * { p10, p25, p75, p90, mean, value, record: { v, year }, fmt(v), valueLabel }
 */
export function rangeChart(host, o) {
  host.replaceChildren();
  // (its width as timeChart's: kept, or guessed, and drawn again once it's known if that's another)
  host._range = o;
  if (!host._ro && typeof ResizeObserver !== "undefined") {
    host._ro = new ResizeObserver(() => { const w = host.clientWidth, was = host._w ?? 0; if (!w) return; host._w = w; seen(host, w); if (Math.abs(w - was) > 2) rangeChart(host, host._range); });
    host._ro.observe(host);
  }
  const W = Math.max(260, (host._w ??= guessW(host)) || 320), Hh = 74, L = 12, R = 12, iw = W - L - R, y0 = 30;
  const all = [o.p10, o.p90, o.value, o.record?.v, o.lowRecord?.v].filter((v) => v != null);
  const lo = Math.min(...all) - 1, hi = Math.max(...all) + 1, X = (v) => L + ((v - lo) / (hi - lo)) * iw;
  const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img", "aria-label": o.summary || "" });
  svg.append(el("rect", { x: X(o.p10), y: y0 - 6, width: X(o.p90) - X(o.p10), height: 12, rx: 6, class: "r-wide" }));
  svg.append(el("rect", { x: X(o.p25), y: y0 - 6, width: X(o.p75) - X(o.p25), height: 12, rx: 6, class: "r-mid" }));
  svg.append(el("line", { x1: X(o.mean), x2: X(o.mean), y1: y0 - 10, y2: y0 + 10, class: "r-mean" }));
  svg.append(el("text", { x: X(o.mean), y: y0 + 24, class: "r-text", "text-anchor": "middle" }, `Normal ${o.fmt(o.mean)}`));
  svg.append(el("text", { x: X(o.p10), y: y0 - 12, class: "r-small", "text-anchor": "middle" }, o.fmt(o.p10)));
  svg.append(el("text", { x: X(o.p90), y: y0 - 12, class: "r-small", "text-anchor": "middle" }, o.fmt(o.p90)));
  if (o.record) {
    const x = X(o.record.v);
    svg.append(el("line", { x1: x, x2: x, y1: y0 - 8, y2: y0 + 8, class: "r-record" }));
    svg.append(el("text", { x: Math.min(x, W - 30), y: y0 + 24, class: "r-small", "text-anchor": "middle" }, `Record ${o.fmt(o.record.v)}`));
  }
  if (o.value != null) {
    const x = X(o.value);
    svg.append(el("circle", { cx: x, cy: y0, r: 7, class: "r-value" }));
    svg.append(el("text", { x: Math.min(Math.max(x, 24), W - 24), y: y0 - 14, class: "r-vtext", "text-anchor": "middle" }, o.valueLabel || o.fmt(o.value)));
  }
  host.append(svg);
}
