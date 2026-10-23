/* ---------------- the site's email: every app's ----------------
   One way to send, and one look, for every app on georgefarrowgreen.com. An app is a brand below: its name, which
   is also the sender's (each app from its own address on the site's domain: account@, inflight@, weather@,
   website@, so a mail app can give each its own picture; Apple's Branded Mail goes by address), its colours, its
   pictures, and what's said at the foot of each of its emails. To send:

     const { text, html } = emailBody({ brand: "weather", title, pill, lines, rows, button, origin });
     await sendEmail(env, { brand: "weather", to, subject, text, html });

   A new app is a new brand here, its pictures drawn by .tools/tests/mailicons.mjs (into mail/, served from the
   site's own address so they show in any app's email).
   Needs RESEND_API_KEY and a sender on a domain verified in Resend: the domain of PIGEON_FROM, else of CONTACT_FROM
   (noreply@georgefarrowgreen.com). Until one is, Resend's test sender onboarding@resend.dev works, but only for
   mail to the Resend account's own address, and only from that one address, so every app sends from it as it is. */
import { HttpError } from "./_http.js";

export const SITE = "https://georgefarrowgreen.com";
export const ACCOUNT_APP = "https://account.georgefarrowgreen.com";
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
// corner; its symbols' colour; and its tiles, each a symbol on a gradient (top, foot), by what an email's about.
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
    foot: (origin) => ({ line: "About your georgefarrowgreen.com account", label: "Manage your account", url: `${accountLink(origin)}/` }),
  },
  inflight: {
    name: "InFlight", tile: "bird",
    ink: "#0a6ef0", inkDark: "#7cb8ff", btn: ["#3d9afe", "#0c6ff0"], glow: "rgba(12,111,240,.7)", pill: "#e8f2ff", pillDark: "#1a2c4f",
    sky: ["#e4eefc", "#eef3fb", "#f7f8fc"], night: ["#132a52", "#081226", "#05060e"], card: "#141b2c", box: "#1e2639", sep: "#2b3552",
    art: { badge: "pigeon/icon-512.png", ink: "#2b84ff",
      tiles: { bird: ["#3d9afe", "#0c71f1"], landed: ["#ffab31", "#ff8b02"], friend: ["#8886ff", "#514eda"], shield: ["#4ad471", "#29b951"], key: ["#3d9afe", "#0c71f1"] } },
  },
  weather: {
    name: "Weather", tile: "sky",
    ink: "#1f63d6", inkDark: "#8cbcff", btn: ["#5aa0fa", "#2b69de"], glow: "rgba(43,105,222,.7)", pill: "#e6f0ff", pillDark: "#1b2d52",
    sky: ["#e0ecfd", "#edf3fc", "#f7f9fc"], night: ["#14295a", "#09142c", "#05070f"], card: "#141b2d", box: "#1e2639", sep: "#2b3552",
    art: { badge: "weather/icon-512.png", ink: "#2b6fe0", tiles: { sky: ["#5fa4fb", "#2b69de"] } },
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

export const emailReady = (env) => !!env.RESEND_API_KEY;
const senderAddress = (env, brand) => {
  const f = String(env.PIGEON_FROM || env.CONTACT_FROM || "onboarding@resend.dev"), a = (/<([^>]+)>/.exec(f) || [, f.trim()])[1];
  const domain = a.split("@")[1];
  return !domain || /(^|\.)resend\.dev$/i.test(domain) ? a : `${brand}@${domain}`;
};
export const emailFrom = (env, brand) => `${brandOf(brand).name} <${senderAddress(env, brand)}>`;
// replyTo: where a reply goes, if not back to the sender (the contact form's: whoever wrote)
export async function sendEmail(env, { brand, to, subject, text, html, headers, replyTo }, { explain = false } = {}) {
  if (!emailReady(env)) throw new HttpError(503, "Email isn’t set up on this server yet.");
  const r = await fetch(env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: emailFrom(env, brand), to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) }),
  });
  if (!r.ok) {
    const why = await r.json().then((d) => d.message || d.error || "", () => "");
    console.error("email", brand, r.status, why);
    // Resend's own reason is shown to the admin only; it can mention the sending setup.
    throw new HttpError(502, explain && why ? `Resend refused the email: ${why}` : "The email couldn’t be sent. Try again in a few minutes.");
  }
}

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// a detail's symbol, by what it is (or a row's own third item)
const SYMBOL = { Account: "person", Handle: "at", From: "person", When: "clock", Sent: "clock", "Deleted on": "clock", Where: "pin", On: "phone",
  How: "key", "Signed in to": "grid", "Changed in": "grid", "Added in": "grid", "Link works": "link", Passkey: "passkey", "New email": "mail", Email: "mail",
  "Your messages": "lock", Pigeons: "bird", "Pigeons sent": "bird", "Pigeons received": "bird", "Miles flown": "route", "New badges": "star", "Next badge": "star" };
// (a line's last two words kept together, so none ends on a word alone)
const together = (s) => String(s).replace(/ (\S+)$/, " $1");
// The look of every email on the site, each app in its own colours: its sky behind; a card with the email's own tile
// and the app's icon as a badge on it (one picture); the title; a pill for the one thing to see at a glance (where a
// sign-in was, the address to confirm, the day); what happened, then (quieter) what to do; someone's own words, as
// they wrote them (quote); the details as a list, a symbol each (rows: [what, value, symbol?]); the button (a web
// link has its address under it, for when it won't work); the foot. Tables and inline styles, so it holds up in
// Gmail and Outlook (gradients and glows there are flat colours), with a dark version, in the app's night sky.
export function emailBody({ brand, title, lines = [], quote, button, icon, rows = [], pill, footer, unsub, origin = SITE, preheader }) {
  const B = brandOf(brand), foot = B.foot?.(origin), e = escHtml;
  const font = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Helvetica,Arial,sans-serif";
  const pic = (f) => e(`${origin}/mail/${f}.png`), tile = Object.hasOwn(B.art.tiles, icon ?? "") ? icon : B.tile;
  const sym = (name, size, style) => `<img src="${pic(`g-${brand}-${name}`)}" width="${size}" height="${size}" alt="" style="border:0;${style}">`;
  const web = button && /^https?:/i.test(button.url);
  const text = [title, pill ? pill[1] : "", ...lines, quote || "", ...rows.map(([k, v]) => `${k}: ${v}`), button ? `${button.label}: ${button.url}` : "",
    footer || "", foot ? [foot.line, foot.url ? `${foot.label}: ${foot.url}` : ""].filter(Boolean).join("\n") : "",
    unsub ? `Turn these emails off: ${unsub}` : ""].filter(Boolean).join("\n\n");
  const sky = (c) => `radial-gradient(120% 70% at 50% -10%,${c[0]},${c[1]} 52%,${c[2]})`;
  const row = ([k, v, s], i) => { const sep = i ? `border-top:1px solid #e6e6ef;` : "";
    return `<tr><td width="29" style="width:17px;padding:0 0 0 16px;vertical-align:middle">${sym(s || SYMBOL[k] || "dot", 17, "display:block")}</td>
      <td class="ml-k ml-sep" style="padding:13px 10px 13px 12px;font-size:15px;line-height:20px;color:#8e8e93;text-align:left;white-space:nowrap;${sep}">${e(k)}</td>
      <td class="ml-v ml-sep" style="padding:13px 16px 13px 0;font-size:15px;line-height:20px;color:#1c1c1e;font-weight:600;text-align:right;${sep}">${e(v)}</td></tr>`; };
  const link = (url, words) => `<a class="ml-a" href="${e(url)}" style="color:${B.ink};text-decoration:none">${e(words)}</a>`;
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${e(title)}</title>
<style>
  a{color:${B.ink}}
  @media (prefers-color-scheme:dark){
    .ml-bg{background-color:${B.night[1]}!important;background-image:${sky(B.night)}!important}
    .ml-card{background:${B.card}!important;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08),0 18px 50px -24px rgba(0,0,0,.8)!important}
    .ml-box{background:${B.box}!important}.ml-sep{border-color:${B.sep}!important}
    .ml-t,.ml-v{color:#f5f5f7!important}.ml-p1{color:#d1d1d6!important}.ml-p2,.ml-k,.ml-f{color:#8e8e9a!important}
    .ml-pill{background:${B.pillDark}!important;color:${B.inkDark}!important}.ml-a{color:${B.inkDark}!important}
  }
  @media (max-width:480px){.ml-card{padding:22px 18px 22px!important}}
</style></head>
<body class="ml-bg" style="margin:0;padding:0;background-color:#f4f4fa;background-image:${sky(B.sky)};font-family:${font};-webkit-font-smoothing:antialiased">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${e(preheader)}</div>` : ""}
<table role="presentation" class="ml-bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f4fa" style="background-color:#f4f4fa;background-image:${sky(B.sky)}"><tr><td align="center" style="padding:30px 14px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px">
  <tr><td class="ml-card" align="center" style="background:#ffffff;border-radius:30px;padding:24px 24px 24px;box-shadow:inset 0 0 0 .5px rgba(60,60,120,.08),0 18px 50px -26px ${B.glow}">
    <!-- the email's own tile, its app's icon a badge on it (the sender says the app's name) -->
    <img src="${pic(`${brand}-${tile}`)}" width="112" height="112" alt="${e(B.name)}" style="display:block;margin:0 auto 8px;border:0">
    <h1 class="ml-t" style="margin:0 0 10px;font-size:26px;line-height:31px;font-weight:700;letter-spacing:-.4px;color:#1c1c1e">${e(together(title))}</h1>
    ${pill ? `<div style="margin:0 0 16px"><span class="ml-pill" style="display:inline-block;padding:6px 13px 6px 11px;border-radius:999px;background:${B.pill};color:${B.ink};font-size:13.5px;line-height:18px;font-weight:600">${sym(pill[0], 15, "display:inline-block;vertical-align:-3px;margin-right:5px")}${e(pill[1])}</span></div>` : ""}
    ${lines.map((l, i) => i ? `<p class="ml-p2" style="margin:0 0 6px;font-size:14.5px;line-height:21px;color:#8e8e93">${e(together(l))}</p>`
      : `<p class="ml-p1" style="margin:0 0 8px;font-size:16px;line-height:23px;color:#3a3a3c">${e(together(l))}</p>`).join("")}
    ${quote ? `<div class="ml-box ml-v" style="margin:16px 0 0;padding:14px 16px;background:#f5f5fa;border-radius:16px;text-align:left;font-size:15px;line-height:22px;color:#1c1c1e;white-space:pre-wrap;word-break:break-word">${e(quote)}</div>` : ""}
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
