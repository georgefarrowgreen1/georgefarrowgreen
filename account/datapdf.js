// Your data as a document (account/app.js exportView): what the export gives (functions/api/account/[[path]].js
// POST export), set out to read and keep. Your profile, then sign-in and security, recent activity, preferences,
// Chat and Weather, each as rows and tables, A4, page numbers at the foot. Written by pdf.js; text Helvetica can't
// show is drawn by the page's canvas, in the system's own font.

import { PDF, Flow } from "./pdf.js";

const INK = "#10162f", INK2 = "#4a5272", INK3 = "#7c84a3", LINE = "#e2e6f0", ACCENT = "#2f6be8", CARD = "#f2f5fc", GOOD = "#1b8f50", WARN = "#b26b00";
const day = (t) => (t ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const when = (t) => (t ? `${day(t)}, ${new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "");
const onOff = (v) => (v ? "On" : "Off");
const hour = (h) => `${String(h).padStart(2, "0")}:00`;
// Chat's notifications, as Chat names them
const NOTES = [["landed", "A pigeon lands"], ["takeoff", "A pigeon takes off"], ["rerouted", "A pigeon changes course"], ["lost", "A pigeon is lost"],
  ["delays", "Weather delays"], ["requests", "Friend requests"], ["accepted", "Request accepted"], ["reactions", "Reactions"], ["moments", "Mid-air moments"],
  ["streaks", "Flight streaks"], ["weekly", "Your week in flight"], ["names", "Show names"]];

// Text Helvetica can't show, drawn as a picture of itself (4 times over, to stay sharp), in the system's own sans
function rasterizer() {
  const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true }), K = 4;
  const font = (size, bold) => `${bold ? 700 : 400} ${size * K}px Helvetica, Arial, system-ui, sans-serif`;
  return {
    measure(s, size, bold) { g.font = font(size, bold); return g.measureText(s).width / K; },
    draw(s, size, bold, color, bg) {
      g.font = font(size, bold);
      const w = Math.max(1, Math.ceil(g.measureText(s).width) + 2), h = Math.ceil(size * 1.3 * K);
      c.width = w; c.height = h;
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.font = font(size, bold); g.fillStyle = color; g.textBaseline = "alphabetic"; g.fillText(s, 1, size * K);
      const px = g.getImageData(0, 0, w, h).data, rgb = new Uint8Array(w * h * 3);
      for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
      return { rgb, w, h, width: w / K, height: h / K, ascent: size };
    },
  };
}
// a picture (the apps' icons) as a JPEG on white, for the PDF
async function asJpeg(src, px = 96) {
  const img = await createImageBitmap(await (await fetch(src)).blob());
  const c = document.createElement("canvas"); c.width = c.height = px;
  const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, px, px); g.drawImage(img, 0, 0, px, px);
  return new Uint8Array(await (await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9))).arrayBuffer());
}
const fromDataUrl = (u) => { const s = atob(String(u).split(",")[1] || ""); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };

// data: what the export gave; did(event): what an event says ("Signed in with a passkey"); units(settings): Weather's
// units in a word ("°C · mph · mm")
export async function dataPdf(data, { did, units }) {
  const a = data.account || {}, si = data.signIn || {}, inf = data.inflight || {}, wx = data.weather || {}, at = new Date(data.exportedAt || Date.now());
  const pdf = new PDF({ title: `Your data · ${a.name}`, author: `${a.name} (@${a.handle})`, raster: rasterizer() });
  const icons = {};
  await Promise.all([["inflight", "/apps/inflight.png"], ["weather", "/apps/weather.png"]].map(async ([k, src]) => { try { icons[k] = pdf.jpeg(await asJpeg(src)); } catch (_) {} }));
  // (every page after the first: whose data, at the top)
  const f = new Flow(pdf, { onPage: (p, n, fl) => {
    if (n === 1) return;
    pdf.text(p, fl.left, 40, `Your data · ${a.name} (@${a.handle})`, { size: 8, color: INK3 });
    pdf.line(p, fl.left, 48, fl.left + fl.width, 48, { color: LINE });
  } });
  const L = f.left, Wd = f.width;

  // ---- the top: what this is, when, and whose ----
  pdf.text(f.p, L, 64, "GEORGEFARROWGREEN.COM ACCOUNT", { size: 8, bold: true, color: ACCENT, spacing: 1.1 });
  pdf.text(f.p, L, 96, "Your data", { size: 30, bold: true, color: INK });
  pdf.text(f.p, L, 116, `Downloaded ${at.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} at ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, { size: 10, color: INK3 });
  const cy = 136, ch = 96;
  pdf.rect(f.p, L, cy, Wd, ch, { fill: CARD, r: 14 });
  if (a.photo) {
    try { pdf.draw(f.p, pdf.jpeg(fromDataUrl(a.photo)), L + 18, cy + 16, 64, 64, { r: 32 }); } catch (_) { a.photo = null; }
  }
  if (!a.photo) {
    pdf.rect(f.p, L + 18, cy + 16, 64, 64, { fill: ACCENT, r: 32 });
    const ini = ([...String(a.name || a.handle || "?").trim()][0] || "?").toUpperCase();
    pdf.text(f.p, L + 50 - pdf.measure(ini, 26, true) / 2, cy + 57, ini, { size: 26, bold: true, color: "#ffffff", bg: ACCENT });
  }
  const tx = L + 100, room = L + Wd - 18 - tx;
  // (a long name or email made smaller to fit)
  const fit = (s, size, bold = false, less = 0) => { while (size > 8 && pdf.measure(s, size, bold) > room - less) size -= 0.5; return size; };
  const ok = a.emailConfirmed ? "Confirmed" : "Not confirmed", es = fit(a.email, 10, false, pdf.measure(ok, 8.5, true) + 8);
  pdf.text(f.p, tx, cy + 36, a.name, { size: fit(a.name, 17, true), bold: true, color: INK, bg: CARD });
  pdf.text(f.p, tx, cy + 54, `@${a.handle}`, { size: 10.5, color: INK2, bg: CARD });
  pdf.text(f.p, tx, cy + 71, a.email, { size: es, color: INK2, bg: CARD });
  pdf.text(f.p, tx + pdf.measure(a.email, es) + 8, cy + 71, ok, { size: 8.5, bold: true, color: a.emailConfirmed ? GOOD : WARN });
  if (a.createdAt) pdf.text(f.p, tx, cy + 86, `Your account since ${new Date(a.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`, { size: 9, color: INK3, bg: CARD });
  f.y = cy + ch + 14;
  f.para("Everything kept with your account that can be read, in every app on the site. Your Chat letters aren’t here: they’re end-to-end encrypted, with keys only your phones have, so the server can’t read them.", { size: 9.5, color: INK2, after: 4 });

  // ---- the pieces: sections, labelled rows, tables, figures ----
  // (a heading kept with what follows it: never left alone at the foot of a page)
  const section = (title, icon) => {
    f.room(150); f.gap(22);
    let x = L;
    if (icon) { pdf.draw(f.p, icon, L, f.y - 2, 22, 22, { r: 5 }); x += 30; }
    pdf.text(f.p, x, f.y + 15, title, { size: 16, bold: true, color: INK });
    f.y += 24; pdf.line(f.p, L, f.y, L + Wd, f.y, { color: INK, lw: 0.9 }); f.gap(6);
  };
  const sub = (title, note) => {
    f.room(note ? 100 : 86); f.gap(10);
    pdf.text(f.p, L, f.y + 10, title.toUpperCase(), { size: 7.5, bold: true, color: INK3, spacing: 0.9 });
    f.y += 14;
    if (note) f.para(note, { size: 8.5, color: INK3, lead: 1.35 });
    f.gap(2);
  };
  const SZ = 9.5, LEAD = 13;
  // label on the left, what it is on the right
  const rows = (list) => {
    for (const [k, v, color] of list.filter(Boolean)) {
      const lw = Wd * 0.42, vl = f.lines(String(v ?? "—"), Wd - lw - 8, SZ), h = vl.length * LEAD + 9;
      f.room(h);
      pdf.text(f.p, L, f.y + 13, k, { size: SZ, color: INK2 });
      vl.forEach((l, i) => pdf.text(f.p, L + Wd - pdf.measure(l, SZ), f.y + 13 + i * LEAD, l, { size: SZ, color: color || INK }));
      f.y += h; pdf.line(f.p, L, f.y, L + Wd, f.y, { color: LINE });
    }
  };
  // columns (each { label, w: its share of the width, right }), a row of text for each thing (the first column in bold,
  // as what the row's about, unless lead is false), the head again on a new page and never left alone at the foot of one
  const table = (cols, list, empty = "None.", { lead = true } = {}) => {
    if (!list.length) { f.para(empty, { size: SZ, color: INK3, after: 2 }); return; }
    const xs = [], total = cols.reduce((s, c) => s + c.w, 0);
    let x = L; for (const c of cols) { xs.push([x, (c.w / total) * Wd - 10]); x += (c.w / total) * Wd; }
    const head = () => {
      f.room(16 + LEAD * 2 + 9);
      cols.forEach((c, i) => pdf.text(f.p, c.right ? xs[i][0] + xs[i][1] - pdf.measure(c.label.toUpperCase(), 7, true, 0.6) : xs[i][0], f.y + 11, c.label.toUpperCase(), { size: 7, bold: true, color: INK3, spacing: 0.6 }));
      f.y += 16; pdf.line(f.p, L, f.y, L + Wd, f.y, { color: LINE });
    };
    head();
    for (const r of list) {
      const bold = (i) => i === 0 && lead;
      const cells = r.map((v, i) => f.lines(String(v ?? ""), xs[i][1], SZ, bold(i)));
      const h = Math.max(...cells.map((c) => c.length)) * LEAD + 9;
      if (f.y + h > f.bottom) { f.page(); head(); }
      cells.forEach((c, i) => c.forEach((l, j) => pdf.text(f.p, cols[i].right ? xs[i][0] + xs[i][1] - pdf.measure(l, SZ, bold(i)) : xs[i][0], f.y + 13 + j * LEAD, l,
        { size: SZ, bold: bold(i), color: i === 0 ? INK : INK2 })));
      f.y += h; pdf.line(f.p, L, f.y, L + Wd, f.y, { color: LINE });
    }
  };
  // a row of figures, each in a box
  const figures = (list) => {
    const per = Math.min(4, list.length), gap = 10, bw = (Wd - gap * (per - 1)) / per, bh = 52;
    for (let i = 0; i < list.length; i += per) {
      f.room(bh + 10);
      list.slice(i, i + per).forEach(([n, label], j) => {
        const x = L + j * (bw + gap);
        pdf.rect(f.p, x, f.y, bw, bh, { fill: CARD, r: 10 });
        pdf.text(f.p, x + 12, f.y + 26, String(n), { size: 18, bold: true, color: INK, bg: CARD });
        pdf.text(f.p, x + 12, f.y + 41, label, { size: 8, color: INK2, bg: CARD });
      });
      f.y += bh + 10;
    }
  };

  // ---- sign-in and security ----
  section("Sign-in and security");
  rows([["Email", a.email], ["Email confirmed", a.emailConfirmed ? "Yes" : "Not yet", a.emailConfirmed ? GOOD : WARN]]);
  sub("Passkeys", "Each signs you in with Face ID, Touch ID or your device’s passcode, in every app on the site.");
  table([{ label: "Name", w: 3 }, { label: "Saved in", w: 3 }, { label: "Added", w: 2 }, { label: "Last used", w: 2 }],
    (si.passkeys || []).map((p) => [p.name || "Passkey", p.savedIn || "Not known", day(p.createdAt), p.lastUsedAt ? day(p.lastUsedAt) : "Not yet"]), "No passkeys yet.");
  sub("Signed-in devices");
  table([{ label: "Device", w: 3 }, { label: "Where", w: 3.4 }, { label: "Signed in", w: 2 }, { label: "Last active", w: 2.4 }],
    (si.devices || []).map((d) => [d.device || "A phone or browser", d.place || "", day(d.signedInAt), when(d.lastActiveAt)]));

  // ---- recent activity ----
  section("Recent activity");
  f.para("The last 30 days, newest first, in every app on the site.", { size: 8.5, color: INK3, after: 4 });
  table([{ label: "When", w: 2.3 }, { label: "What", w: 3.6 }, { label: "App", w: 1.4 }, { label: "Device", w: 2.1 }, { label: "Where", w: 2.4 }],
    (si.recentActivity || []).map((e) => [when(e.at), did({ ...e, at: Date.parse(e.at) }), e.app || "", e.device || "", e.place || ""]), "Nothing in the last 30 days.", { lead: false });

  // ---- preferences ----
  section("Preferences");
  rows([["Appearance", { auto: "Automatic", light: "Light", dark: "Dark" }[a.appearance] || "Automatic"], ["Units", units(wx.settings || {})]]);

  // ---- Chat ----
  section("Chat", icons.inflight);
  const pg = inf.pigeons || {};
  figures([[(inf.friends || []).length, "friends"], [(inf.groups || []).length, "groups"], [pg.sent || 0, "pigeons sent"], [pg.received || 0, "pigeons received"],
    [(inf.passport || []).length, "places in your passport"], [(inf.birds || []).length, "birds"]]);
  rows([["Where you are", inf.place ? `${inf.place}${inf.location?.approximate ? " (to about 10 km)" : ""}` : "Not set"]]);
  sub("Friends");
  table([{ label: "Name", w: 3 }, { label: "Handle", w: 2.5 }, { label: "Friends since", w: 2 }],
    (inf.friends || []).slice().sort((x, y) => String(x.name).localeCompare(String(y.name))).map((x) => [x.name, `@${x.handle}`, day(x.since)]), "No friends yet.");
  sub("Groups");
  table([{ label: "Name", w: 4 }, { label: "Joined", w: 2 }], (inf.groups || []).map((g) => [g.name, day(g.joinedAt)]), "No groups.");
  sub("Passport", "Every place your pigeons have been, and when one first got there.");
  table([{ label: "Place", w: 4 }, { label: "First there", w: 2 }, { label: "Times", w: 1, right: true }],
    (inf.passport || []).slice().sort((x, y) => Date.parse(x.firstAt) - Date.parse(y.firstAt)).map((p) => [p.place, day(p.firstAt), String(p.times ?? 1)]), "No stamps yet.");
  if ((inf.birds || []).length) {
    sub("Birds");
    table([{ label: "Name", w: 3 }, { label: "Hatched", w: 2 }, { label: "Flown", w: 1.6, right: true }], inf.birds.map((x) => [x.name, day(x.hatchedAt), `${(x.km || 0).toLocaleString("en-GB")} km`]));
  }
  const st = inf.settings || {}, nt = st.notifications || {};
  sub("Notifications");
  rows([...NOTES.map(([k, label]) => [label, onOff(nt[k])]), ["Quiet hours", nt.quiet ? `${hour(nt.quietFrom)} to ${hour(nt.quietTo)}` : "Off"], ["Email me", onOff(st.emailWhenPigeonsLand)]]);
  sub("Privacy");
  rows([["Show when I’m online", onOff(st.showWhenOnline)], ["Read receipts", onOff(st.readReceipts)], ["Share my news", onOff(st.shareNews)],
    ["Live tracker", onOff(st.liveTracker)], ["Approximate location", onOff(st.approximateLocation)]]);

  // ---- Weather ----
  section("Weather", icons.weather);
  const places = wx.places || [], nfy = wx.notifications || {}, set = wx.settings || {};
  figures([[places.length, places.length === 1 ? "saved place" : "saved places"], [(nfy.places || []).length, "places notifying"], [(wx.devices || []).length, (wx.devices || []).length === 1 ? "device notified" : "devices notified"]]);
  sub("Saved places");
  const deg = (v, pos, neg) => (typeof v === "number" ? `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}` : "");
  table([{ label: "Place", w: 4 }, { label: "Latitude", w: 1.6, right: true }, { label: "Longitude", w: 1.6, right: true }],
    places.map((p) => [p.name || "A place", deg(p.lat, "N", "S"), deg(p.lon, "E", "W")]), "No saved places.");
  sub("Notifications");
  table([{ label: "Place", w: 4 }, { label: "Rain", w: 1.2 }, { label: "Warnings", w: 1.4 }], (nfy.places || []).map((p) => [p.name || "A place", onOff(p.rain), onOff(p.warn)]), "None.");
  rows([["Morning brief", nfy.brief ? `${nfy.briefAt || "07:00"}, for ${nfy.brief.name || "your place"}` : "Off"],
    (wx.devices || []).length && ["Sent to", wx.devices.join(", ")]]);
  sub("Settings");
  const acts = (set.activities || []).map((x) => x.name).filter(Boolean);
  rows([["Units", units(set)], set.commute && ["Commute", set.commute.on ? `${set.commute.am} and ${set.commute.pm}` : "Off"], acts.length && ["Activities", acts.join(", ")]]);

  // ---- the foot of every page ----
  const N = pdf.pages.length;
  pdf.pages.forEach((p, i) => {
    pdf.line(p, L, pdf.H - 44, L + Wd, pdf.H - 44, { color: LINE });
    pdf.text(p, L, pdf.H - 30, "inflite.ai", { size: 8, color: INK3 });
    const pn = `Page ${i + 1} of ${N}`;
    pdf.text(p, L + Wd - pdf.measure(pn, 8), pdf.H - 30, pn, { size: 8, color: INK3 });
  });
  return new Blob([await pdf.build(at)], { type: "application/pdf" });
}
