/* ---------------- the site's email: every app's ----------------
   One way to send, and one look, for every app (inflite.ai's, and the home page's). An app is a brand below: its name, which
   is also the sender's (each app from its own address: account@, chat@ and weather@ at inflite.ai, the home page's
   website@ at georgefarrowgreen.com, so a mail app can give each its own picture; Apple's Branded Mail goes by address), its colours, its
   pictures, and what's said at the foot of each of its emails. To send:

     const { text, html } = emailBody({ brand: "weather", title, pill, lines, rows, button, origin });
     await sendEmail(env, { brand: "weather", to, subject, text, html });

   A new app is a new brand here, its pictures drawn by .tools/tests/mailicons.mjs (into mail/, served from the
   site's own address so they show in any app's email).
   The apps' are sent by Cloudflare's Email Service, from inflite.ai (CF_EMAIL_TOKEN and CF_ACCOUNT_ID); the home
   page's by Resend, from georgefarrowgreen.com (RESEND_API_KEY, and CONTACT_FROM or PIGEON_FROM on a domain verified
   there). Without Cloudflare's set up, the apps' go by Resend too. With no Resend sender set, its test sender
   onboarding@resend.dev works, but only for mail to the Resend account's own address. */
import { HttpError } from "./_http.js";

// (the home page's address: the emails' pictures are kept there, and it stands for "this is production" below)
export const SITE = "https://georgefarrowgreen.com";
export const ACCOUNT_APP = "https://account.inflite.ai";
// (where every sign-in on the site happens: functions/_acctapp.js AUTH_HOST)
export const AUTH_APP = "https://auth.inflite.ai";
// (where the apps' emails' pictures come from: inflite.ai, as they do; the home page's from its own site)
export const APPS_PICS = ACCOUNT_APP;
// the account's page, for links in emails (this site's, or a local test server's copy)
export const accountLink = (origin = SITE) => (origin === SITE ? ACCOUNT_APP : origin + "/account");
// Where links in emails point: this site, or a local test server. Never a
// *.pages.dev or preview host (the notification tick runs through one).
export function linkOrigin(request) {
  const u = new URL(typeof request === "string" ? request : request.url);
  return /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? u.origin : SITE;
}
// "12 Oct 2026, 22:15" in UK time, for "when" rows
export const ukTime = (t) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);

// Each app that sends email. tile: its usual picture. art (for mailicons.mjs): its icon, the badge on each tile's
// corner; its symbols' colour (and any symbols of its own, syms); and its tiles, each a symbol on a gradient (top,
// foot), by what an email's about (a tile "warn-amber" is the symbol "warn").
// foot: what's said under each of its emails, and a link (the rest of a foot is the email's own: why it came, a
// way to turn them off). The colours: ink (links, the pill's words; inkDark at night), the button's gradient and
// its glow, the pill, the sky behind (sky by day, night in dark mode), and the card, the details' box and their
// lines at night.
export const BRANDS = {
  account: {
    name: "Account", tile: "shield",
    ink: "#5a4fe0", inkDark: "#a7acff", btn: ["#7d8aff", "#4a45dc"], glow: "rgba(74,69,220,.75)", pill: "#eef0ff", pillDark: "#262a55",
    sky: ["#e9eefc", "#f3f0fb", "#f7f8fc"], night: ["#1a2350", "#0a0f26", "#05060e"], card: "#16182b", box: "#20233a", sep: "#2d3150",
    art: { badge: "account/icon-512.png", ink: "#6a64f2",
      tiles: { shield: ["#8a93ff", "#5a4fe0"], key: ["#8a93ff", "#5a4fe0"], mail: ["#8a93ff", "#5a4fe0"], passkey: ["#8a93ff", "#5a4fe0"], trash: ["#ff8a7a", "#e5372c"] } },
    foot: (origin) => ({ line: "About your inflite.ai account", label: "Manage your account", url: `${accountLink(origin)}/` }),
  },
  // (Chat's brand is still "inflight", its old name, as its pictures in mail/ are; it sends from chat@)
  inflight: {
    name: "Chat", from: "chat", tile: "bird",
    ink: "#0a6ef0", inkDark: "#7cb8ff", btn: ["#3d9afe", "#0c6ff0"], glow: "rgba(12,111,240,.7)", pill: "#e8f2ff", pillDark: "#1a2c4f",
    sky: ["#e4eefc", "#eef3fb", "#f7f8fc"], night: ["#132a52", "#081226", "#05060e"], card: "#141b2c", box: "#1e2639", sep: "#2b3552",
    art: { badge: "pigeon/icon-512.png", ink: "#2b84ff",
      tiles: { bird: ["#3d9afe", "#0c71f1"], landed: ["#ffab31", "#ff8b02"], friend: ["#8886ff", "#514eda"], shield: ["#4ad471", "#29b951"], key: ["#3d9afe", "#0c71f1"] } },
  },
  weather: {
    name: "Weather", tile: "sky",
    ink: "#1f63d6", inkDark: "#8cbcff", btn: ["#5aa0fa", "#2b69de"], glow: "rgba(43,105,222,.7)", pill: "#e6f0ff", pillDark: "#1b2d52",
    sky: ["#e0ecfd", "#edf3fc", "#f7f9fc"], night: ["#14295a", "#09142c", "#05070f"], card: "#141b2d", box: "#1e2639", sep: "#2b3552",
    // (its warnings' tiles in the warning's own colour; and symbols of its own for a briefing's details)
    art: { badge: "weather/icon-512.png", ink: "#2b6fe0", syms: ["warn", "wind", "temp", "rain", "sunrise"],
      tiles: { sky: ["#5fa4fb", "#2b69de"], "warn-yellow": ["#ffd84d", "#f5b400"], "warn-amber": ["#ffb547", "#ff8a00"], "warn-red": ["#ff7a6e", "#e5302a"] } },
  },
  // the site's own page (its contact form, to its owner)
  website: {
    name: "Website", tile: "mail",
    ink: "#6a4fe6", inkDark: "#bba6ff", btn: ["#8aa6ff", "#8656f0"], glow: "rgba(134,86,240,.7)", pill: "#f1ecff", pillDark: "#2c2552",
    sky: ["#ebe8fd", "#f4f0fb", "#f8f7fc"], night: ["#231a50", "#0f0a26", "#06050e"], card: "#18162b", box: "#221f3a", sep: "#302c50",
    art: { badge: "favicon.svg", ink: "#7a5af0", tiles: { mail: ["#8fb0ff", "#9461f2"] } },
    foot: () => ({ line: "From the contact form on georgefarrowgreen.com" }),
  },
};
const brandOf = (brand) => { const B = Object.hasOwn(BRANDS, brand) && BRANDS[brand]; if (!B) throw new Error(`No email brand "${brand}"`); return B; };

// How each email's sent, and who it's from. The apps' (Chat, Weather, the account) through Cloudflare's Email Service,
// from inflite.ai, where it's set up (CF_EMAIL_TOKEN, an API token that can send email, and CF_ACCOUNT_ID); the home
// page's (the contact form's), and the apps' until then, through Resend (RESEND_API_KEY), from the domain of
// CONTACT_FROM / PIGEON_FROM (georgefarrowgreen.com). Each from its own address: chat@, account@, weather@, website@.
// With no sender set for Resend, its test sender for all.
const APPS_MAIL = "inflite.ai";
const viaCloudflare = (env, brand) => brand !== "website" && !!(env.CF_EMAIL_TOKEN && env.CF_ACCOUNT_ID);
export const emailReady = (env) => !!env.RESEND_API_KEY || !!(env.CF_EMAIL_TOKEN && env.CF_ACCOUNT_ID);
const senderAddress = (env, brand) => {
  if (viaCloudflare(env, brand)) return `${brandOf(brand).from || brand}@${env.APPS_MAIL_DOMAIN || APPS_MAIL}`;
  const f = String((brand === "website" ? env.CONTACT_FROM || env.PIGEON_FROM : env.PIGEON_FROM || env.CONTACT_FROM) || "onboarding@resend.dev"), a = (/<([^>]+)>/.exec(f) || [, f.trim()])[1];
  const domain = a.split("@")[1];
  return !domain || /(^|\.)resend\.dev$/i.test(domain) ? a : `${brandOf(brand).from || brand}@${domain}`;
};
export const emailFrom = (env, brand) => `${brandOf(brand).name} <${senderAddress(env, brand)}>`;
// replyTo: where a reply goes, if not back to the sender (the contact form's: whoever wrote)
export async function sendEmail(env, { brand, to, subject, text, html, headers, replyTo }, { explain = false } = {}) {
  const cf = viaCloudflare(env, brand), service = cf ? "Cloudflare" : "Resend";
  if (!(cf || env.RESEND_API_KEY)) throw new HttpError(503, "Email isn’t set up on this server yet.");
  const body = cf
    ? { from: { address: senderAddress(env, brand), name: brandOf(brand).name }, to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) }
    : { from: emailFrom(env, brand), to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) };
  const r = await fetch(cf ? `${env.CF_EMAIL_API || "https://api.cloudflare.com/client/v4"}/accounts/${env.CF_ACCOUNT_ID}/email/sending/send` : env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cf ? env.CF_EMAIL_TOKEN : env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // (given up on after 10 seconds, as one the service doesn't answer is one that couldn't be sent: so nothing that
    // waits on it, a new account's reply among them, is held past the account page's own 30)
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  // (Cloudflare says how it went in its answer too: a recipient that bounced for good is one it couldn't send to)
  const d = r ? await r.json().catch(() => ({})) : {};
  const bounced = cf && r?.ok && d.result?.permanent_bounces?.length;
  if (!r?.ok || (cf && d.success === false) || bounced) {
    const why = bounced ? "The address bounced" : cf ? (d.errors || []).map((e) => e.message).filter(Boolean).join(", ") : d.message || d.error || "";
    console.error("email", service, brand, r?.status, why);
    await noteSend(env, why || (r ? `${service} refused it (${r.status})` : `Couldn’t reach ${service}`));
    // The service's own reason is shown to the admin only; it can mention the sending setup.
    throw new HttpError(502, explain && why ? `${service} refused the email: ${why}` : "The email couldn’t be sent. Try again in a few minutes.");
  }
  await noteSend(env);
}
// How sending's going, for Admin (functions/api/pigeon adminSummary): the run of failures since the last email that
// went (pg_meta mail_fail: how many, since when, the latest reason); one that goes clears it
async function noteSend(env, why) {
  try {
    if (!env.DB) return;
    await (why == null ? env.DB.prepare("DELETE FROM pg_meta WHERE k = 'mail_fail'")
      : env.DB.prepare(`INSERT INTO pg_meta (k, v) VALUES ('mail_fail', json_object('n', 1, 'since', ?1, 'at', ?1, 'why', ?2))
          ON CONFLICT(k) DO UPDATE SET v = json_set(v, '$.n', json_extract(v, '$.n') + 1, '$.at', ?1, '$.why', ?2)`).bind(Date.now(), String(why).slice(0, 200))).run();
  } catch (_) { /* (never in the way of the email itself) */ }
}

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// a notice's colours, by its tone (a warning's): its box, its words, and the same at night
export const NOTICE = { yellow: ["#fff5c7", "#6b5000", "#3b3110", "#ffe08a"], amber: ["#ffe9d1", "#7a3b00", "#3d2610", "#ffc58f"], red: ["#ffe1de", "#8a1c14", "#3f1715", "#ffaca4"] };
// a detail's symbol, by what it is (or a row's own third item)
const SYMBOL = { Account: "person", Handle: "at", From: "person", When: "clock", Sent: "clock", "Deleted on": "clock", Where: "pin", On: "phone",
  How: "key", "Signed in to": "grid", "Changed in": "grid", "Added in": "grid", "Link works": "link", Passkey: "passkey", "New email": "mail", Email: "mail",
  "Your messages": "lock", Pigeons: "bird", "Pigeons sent": "bird", "Pigeons received": "bird", "Miles flown": "route", "New badges": "star", "Next badge": "star" };
// (a line's last two words kept together, so none ends on a word alone)
const together = (s) => String(s).replace(/ (\S+)$/, " $1");
// The day's rain under the strip: a bar a quarter hour, as tall as the rain's heavy (bar.levels: 0 dry to 4 heavy), its
// hours under it (bar.labels, every three hours from 06:00); in table cells, so it holds up in every mail app
const BAR_H = [3, 10, 17, 23, 28], BAR_C = ["#6f9cee", "#cfe0fc", "#ffffff", "#ffffff", "#ffffff"];
function barRow(bar, cols) {
  const n = bar.levels.length, cell = (100 / n).toFixed(3);
  const bars = bar.levels.map((l) => `<td width="${cell}%" valign="bottom" style="height:28px;padding:0 ${l ? 1 : 0}px 0 0;vertical-align:bottom;line-height:0;font-size:0"><div style="height:${BAR_H[l]}px;line-height:${BAR_H[l]}px;font-size:0;background:${BAR_C[l]};border-radius:${l ? 2 : 0}px">&nbsp;</div></td>`).join("");
  const step = n / bar.labels.length;
  const labels = bar.labels.map((t) => `<td colspan="${step}" style="padding:5px 0 0;font-size:10.5px;line-height:13px;font-weight:600;color:#cfe0ff;text-align:left">${escHtml(t)}</td>`).join("");
  return `<tr><td colspan="${cols}" class="ml-bar" style="padding:2px 12px 12px;border-top:1px solid rgba(255,255,255,.18)">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;margin-top:10px"><tr>${bars}</tr><tr>${labels}</tr></table></td></tr>`;
}
// The look of every email on the site, each app in its own colours: its sky behind; a card with the email's own tile
// and the app's icon as a badge on it (one picture); the title; a pill for the one thing to see at a glance (where a
// sign-in was, the address to confirm, the day); what happened, then (quieter) what to do; someone's own words, as
// they wrote them (quote); a notice in its own colour (notice: { tone, lead, text }: a warning in force); a strip of a
// few columns on the app's own colour (strip: [what, picture, big, small] each: a day's morning, afternoon and evening);
// the day's rain under the strip (bar: { levels, labels }, above); the details as a list, a symbol each (rows: [what,
// value, symbol?]); the button (a web link has its address under it, for when it won't work, unless fallback is false:
// a link that only opens an app); the foot. asOf: a quiet line under the lines (when a forecast was); compact: a smaller
// picture and title, so what's said sits higher. Tables and inline styles, so it holds up in Gmail and Outlook
// (gradients and glows there are flat colours), with a dark version, in the app's night sky.
export function emailBody({ brand, title, lines = [], asOf, quote, notice, strip = [], bar, button, icon, rows = [], pill, footer, unsub, origin = SITE, preheader, compact = false, fallback = true }) {
  const B = brandOf(brand), foot = B.foot?.(origin), e = escHtml;
  const font = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Helvetica,Arial,sans-serif";
  const pic = (f) => e(`${origin === SITE && brand !== "website" ? APPS_PICS : origin}/mail/${f}.png`), tile = Object.hasOwn(B.art.tiles, icon ?? "") ? icon : B.tile;
  const sym = (name, size, style) => `<img src="${pic(`g-${brand}-${name}`)}" width="${size}" height="${size}" alt="" style="border:0;${style}">`;
  const web = fallback && button && /^https?:/i.test(button.url);
  const N = notice && (NOTICE[notice.tone] || NOTICE.yellow);
  const text = [title, pill ? pill[1] : "", ...lines, asOf || "", quote || "", notice ? `${notice.lead} ${notice.text}` : "", strip.map(([k, , big, small]) => `${k}: ${big}${small ? `, ${small}` : ""}`).join("\n"),
    ...rows.map(([k, v]) => `${k}: ${v}`), button ? `${button.label}: ${button.url}` : "",
    footer || "", foot ? [foot.line, foot.url ? `${foot.label}: ${foot.url}` : ""].filter(Boolean).join("\n") : "",
    unsub ? `Turn these emails off: ${unsub}` : ""].filter(Boolean).join("\n\n");
  const sky = (c) => `radial-gradient(120% 70% at 50% -10%,${c[0]},${c[1]} 52%,${c[2]})`;
  const row = ([k, v, s], i) => { const sep = i ? `border-top:1px solid #e6e6ef;` : "";
    return `<tr><td width="29" style="width:17px;padding:0 0 0 16px;vertical-align:middle">${sym(s || SYMBOL[k] || "dot", 17, "display:block")}</td>
      <td class="ml-k ml-sep" style="padding:13px 10px 13px 12px;font-size:15px;line-height:20px;color:#8e8e93;text-align:left;white-space:nowrap;${sep}">${e(k)}</td>
      <td class="ml-v ml-sep" style="padding:13px 16px 13px 0;font-size:15px;line-height:20px;color:#1c1c1e;font-weight:600;text-align:right;${sep}">${e(v)}</td></tr>`; };
  const link = (url, words) => `<a class="ml-a" href="${e(url)}" style="color:${B.ink};text-decoration:none">${e(words)}</a>`;
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${e(title)}</title>
<style>
  a{color:${B.ink}}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font:inherit!important}
  @media (prefers-color-scheme:dark){
    .ml-bg{background-color:${B.night[1]}!important;background-image:${sky(B.night)}!important}
    .ml-card{background:${B.card}!important;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08),0 18px 50px -24px rgba(0,0,0,.8)!important}
    .ml-box{background:${B.box}!important}.ml-sep{border-color:${B.sep}!important}
    .ml-t,.ml-v{color:#f5f5f7!important}.ml-p1{color:#d1d1d6!important}.ml-p2,.ml-k,.ml-f{color:#8e8e9a!important}
    .ml-pill{background:${B.pillDark}!important;color:${B.inkDark}!important}.ml-a{color:${B.inkDark}!important}${N ? `
    .ml-n{background:${N[2]}!important}.ml-n-t{color:${N[3]}!important}` : ""}
  }
  @media (max-width:480px){.ml-card{padding:22px 18px 22px!important}}
</style></head>
<body class="ml-bg" style="margin:0;padding:0;background-color:#f4f4fa;background-image:${sky(B.sky)};font-family:${font};-webkit-font-smoothing:antialiased">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${e(preheader)}</div>` : ""}
<table role="presentation" class="ml-bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f4fa" style="background-color:#f4f4fa;background-image:${sky(B.sky)}"><tr><td align="center" style="padding:30px 14px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px">
  <tr><td class="ml-card" align="center" style="background:#ffffff;border-radius:30px;padding:24px 24px 24px;box-shadow:inset 0 0 0 .5px rgba(60,60,120,.08),0 18px 50px -26px ${B.glow}">
    <!-- the email's own tile, its app's icon a badge on it (the sender says the app's name) -->
    <img class="ml-tile" src="${pic(`${brand}-${tile}`)}" width="${compact ? 64 : 112}" height="${compact ? 64 : 112}" alt="${e(B.name)}" style="display:block;margin:0 auto ${compact ? 10 : 8}px;border:0">
    <h1 class="ml-t" style="margin:0 0 10px;font-size:${compact ? 23 : 26}px;line-height:${compact ? 28 : 31}px;font-weight:700;letter-spacing:-.4px;color:#1c1c1e">${e(together(title))}</h1>
    ${pill ? `<div style="margin:0 0 16px"><span class="ml-pill" style="display:inline-block;padding:6px 13px 6px 11px;border-radius:999px;background:${B.pill};color:${B.ink};font-size:13.5px;line-height:18px;font-weight:600">${sym(pill[0], 15, "display:inline-block;vertical-align:-3px;margin-right:5px")}${e(pill[1])}</span></div>` : ""}
    ${lines.map((l, i) => i ? `<p class="ml-p2" style="margin:0 0 6px;font-size:14.5px;line-height:21px;color:#8e8e93">${e(together(l))}</p>`
      : `<p class="ml-p1" style="margin:0 0 8px;font-size:16px;line-height:23px;color:#3a3a3c">${e(together(l))}</p>`).join("")}
    ${asOf ? `<p class="ml-p2 ml-asof" style="margin:0 0 4px;font-size:12.5px;line-height:18px;color:#8e8e93">${e(together(asOf))}</p>` : ""}
    ${quote ? `<div class="ml-box ml-v" style="margin:16px 0 0;padding:14px 16px;background:#f5f5fa;border-radius:16px;text-align:left;font-size:15px;line-height:22px;color:#1c1c1e;white-space:pre-wrap;word-break:break-word">${e(quote)}</div>` : ""}
    ${N ? `<table role="presentation" class="ml-n" width="100%" cellpadding="0" cellspacing="0" bgcolor="${N[0]}" style="margin:18px 0 0;background:${N[0]};border-radius:16px;border-collapse:separate"><tr>
      <td width="32" style="width:18px;padding:12px 0 12px 14px;vertical-align:middle"><img src="${pic(`g-warn-${notice.tone in NOTICE ? notice.tone : "yellow"}`)}" width="18" height="18" alt="" style="display:block;border:0"></td>
      <td class="ml-n-t" style="padding:12px 14px 12px 10px;font-size:14.5px;line-height:20px;color:${N[1]};text-align:left"><b>${e(notice.lead)}</b> ${e(notice.text)}</td></tr></table>` : ""}
    ${strip.length ? `<table role="presentation" class="ml-strip" width="100%" cellpadding="0" cellspacing="0" bgcolor="${B.btn[1]}" style="margin:18px 0 0;background-color:${B.btn[1]};background-image:linear-gradient(180deg,${B.btn[0]},${B.btn[1]});border-radius:18px;border-collapse:separate"><tr>${strip.map(([k, p, big, small], i) =>
      `<td align="center" width="${Math.floor(100 / strip.length)}%" style="padding:14px 4px 13px;${i ? "border-left:1px solid rgba(255,255,255,.18);" : ""}">
        <div style="font-size:12px;line-height:15px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#dbe9ff">${e(k)}</div>
        <img src="${pic(p)}" width="44" height="44" alt="" style="display:block;margin:5px auto 3px;border:0">
        <div style="font-size:22px;line-height:26px;font-weight:700;color:#ffffff">${e(big)}</div>
        ${small ? `<div style="font-size:13px;line-height:17px;font-weight:600;color:#d6e6ff">${e(small)}</div>` : ""}</td>`).join("")}</tr>${bar ? barRow(bar, strip.length) : ""}</table>` : ""}
    ${rows.length ? `<table role="presentation" class="ml-box" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;background:#f5f5fa;border-radius:16px;border-collapse:separate">${rows.map(row).join("")}</table>` : ""}
    ${button ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td align="center" bgcolor="${B.btn[1]}" style="background-color:${B.btn[1]};background-image:linear-gradient(180deg,${B.btn[0]},${B.btn[1]});border-radius:999px;box-shadow:0 10px 22px -10px ${B.glow},inset 0 1px 0 rgba(255,255,255,.25)">
      <a href="${e(button.url)}" style="display:block;padding:15px 20px;font-size:17px;line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${e(button.label)}</a></td></tr></table>` : ""}
    ${web ? `<p class="ml-f" style="margin:14px 4px 0;font-size:11.5px;line-height:16px;color:#8e8e93;word-break:break-all">Button not working? Paste this link into your browser:<br><a class="ml-a" href="${e(button.url)}" style="color:${B.ink}">${e(button.url)}</a></p>` : ""}
  </td></tr>
  <tr><td align="center" class="ml-f" style="padding:18px 22px 0;font-size:12px;line-height:18px;color:#8e8e93">
    ${footer ? `${e(footer)}<br>` : ""}${foot ? `${e(foot.line)}${foot.url ? `<br>${link(foot.url, foot.label)}` : ""}` : ""}${unsub ? link(unsub, "Turn these emails off") : ""}
  </td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
