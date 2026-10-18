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
 *   y         { min?, max?, ticks?, fmt(v) }   (fixed ends, or worked out from the data)
 *   x         { hour(t), day(t), step }          (labels for hours and for the start of each day)
 *   now       a time to mark "Now"
 *   nights    [[from, to]]              (shaded softly)
 *   marks     [{ t, v, text }]          (a few direct labels)
 *   tip(p)    → { title, rows: [[value, label]] }
 *   summary   what the chart shows, for screen readers
 *   table     { head: [..], rows: [[..]] }
 */
export function timeChart(host, opts) {
  host._chart = opts;
  if (!host._ro && typeof ResizeObserver !== "undefined") {
    let w = 0;
    host._ro = new ResizeObserver(() => { if (Math.abs(host.clientWidth - w) > 2) { w = host.clientWidth; draw(host); } });
    host._ro.observe(host);
  }
  draw(host);
}

function draw(host) {
  const o = host._chart; if (!o) return;
  const pts = o.points.filter((p) => p.v != null);
  host.replaceChildren();
  host.classList.add("chart");
  if (!pts.length) { host.textContent = "No data"; return; }
  const W = Math.max(260, host.clientWidth || 340), Hh = o.height || 170;
  const L = 34, R = 10, T = 18, B = 26, iw = W - L - R, ih = Hh - T - B;
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
  for (const v of ys.ticks) {
    if (v < ys.lo - 1e-9 || v > ys.hi + 1e-9) continue;
    svg.append(el("line", { x1: L, x2: L + iw, y1: Y(v), y2: Y(v), class: "c-grid" }));
    svg.append(el("text", { x: L - 6, y: Y(v) + 3.5, class: "c-ytick", "text-anchor": "end" }, o.y?.fmt ? o.y.fmt(v) : String(v)));
  }
  // the hours along the bottom: a label every few hours, the day's name at midnight
  const every = [1, 2, 3, 4, 6, 12, 24].find((n) => (iw / ((t1 - t0) / step)) * n >= 34) || 24;
  for (let t = Math.ceil(t0 / step) * step; t < t1 + 1; t += step) {
    const d = new Date(t), h = d.getUTCHours();
    if (step === HOUR && h % every !== 0) continue;
    if (step !== HOUR && Math.round((t - t0) / step) % every !== 0) continue;
    const x = X(t) + (cols ? (X(t + step) - X(t)) / 2 : 0);
    if (x < L - 1 || x > L + iw + 1) continue;
    const day = step === HOUR && h === 0 && o.x?.day;
    svg.append(el("text", { x, y: Hh - 8, class: day ? "c-xtick c-day" : "c-xtick", "text-anchor": "middle" }, day ? o.x.day(t) : o.x?.hour ? o.x.hour(t) : String(h)));
    if (day) svg.append(el("line", { x1: X(t), x2: X(t), y1: T, y2: T + ih, class: "c-daysep" }));
  }
  // the data
  if (cols) {
    const slot = iw / ((t1 - t0) / step), w = Math.max(1, Math.min(24, slot - 2));
    for (const p of pts) {
      const x = X(p.t) + (slot - w) / 2, y = Y(Math.max(ys.lo, p.v)), h = Y(ys.lo) - y;
      if (h > 0.4) svg.append(el("path", { d: colPath(x, y, w, h), fill: p.color || o.color, class: "c-col" }));
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
    svg.append(el("path", { d, stroke: o.color, class: "c-line" }));
  }
  // now
  if (o.now != null && o.now >= t0 && o.now <= t1) {
    const x = X(o.now);
    svg.append(el("line", { x1: x, x2: x, y1: T - 4, y2: T + ih, class: "c-now" }));
    svg.append(el("text", { x: Math.min(Math.max(x, L + 12), L + iw - 12), y: T - 7, class: "c-nowtext", "text-anchor": "middle" }, "Now"));
  }
  // a few labels, on the marks themselves
  for (const m of o.marks || []) {
    const x = cols ? X(m.t) + (X(m.t + step) - X(m.t)) / 2 : X(m.t), y = Y(m.v);
    if (!cols) svg.append(el("circle", { cx: x, cy: y, r: 4, fill: o.color, class: "c-dot" }));
    const tx = Math.min(Math.max(x, L + 14), L + iw - 14), above = y - T > 16;
    svg.append(el("text", { x: tx, y: above ? y - 9 : y + 17, class: "c-label", "text-anchor": "middle" }, m.text));
  }
  // the crosshair and the readout
  const cross = el("g", { class: "c-cross", visibility: "hidden" });
  const cl = el("line", { y1: T, y2: T + ih, class: "c-crossline" }), cd = el("circle", { r: 4.5, class: "c-crossdot", fill: o.color });
  cross.append(cl); if (!cols) cross.append(cd);
  svg.append(cross);
  const hit = el("rect", { x: L, y: 0, width: iw, height: Hh, fill: "transparent", class: "c-hit" });
  svg.append(hit);
  host.append(svg);
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
  hit.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  hit.addEventListener("pointerdown", (e) => show(nearest(e.clientX)));
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
  const W = Math.max(260, host.clientWidth || 320), Hh = 74, L = 12, R = 12, iw = W - L - R, y0 = 30;
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
