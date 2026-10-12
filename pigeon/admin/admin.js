// InFlight admin. Uses the site owner's sign-in (the same password or passkey
// as the key icon on the home page). Shows account details only: passwords,
// private keys and scrolls never reach the server in readable form.
// Built from the app's own pieces (styles.css): large title, grouped lists,
// bottom sheets and toasts, so it looks and moves like InFlight itself.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const fmtDate = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
// 5m ago, Today 21:38, Yesterday 21:38, Mon 21:38, 3 Oct 2026 (as in the app)
function fmtSeen(t) {
  if (!t) return "Never";
  const ms = Date.now() - t;
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MIN))}m ago`;
  if (sameDay(t, Date.now())) return `Today ${fmtTime(t)}`;
  if (sameDay(t, Date.now() - DAY)) return `Yesterday ${fmtTime(t)}`;
  return ms < 6 * DAY ? `${DOW[new Date(t).getDay()]} ${fmtTime(t)}` : fmtDate(t);
}
const ONLINE_MS = 150e3;                       // the app checks in every 15 s, noted once a minute
const online = (u) => u.last_seen && Date.now() - u.last_seen < ONLINE_MS;
const hue = (s) => ([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0) % 5 + 1;
const initials = (n) => String(n).trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const b64u = {
  enc(buf) { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  dec(str) { str = String(str).replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "="; return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)); },
};

/* ---------- icons (the app's) ---------- */
const ico = (d) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">${d}</svg>`;
const BIRD = "M3.2 11.6 5 10.6C6.2 9.4 8 9.2 9.4 9.9L12.6 3.6C14.4 3 15.6 4 15.4 5.8L14.2 10.6C16.2 10.6 18.4 10 20.6 8.8L21 9.6C20.2 11.2 19.4 12.2 18.6 12.8L21.4 14.4 17.4 14.6C15.4 16.6 12 17.4 9.4 16.2 7.4 15.3 6.1 13.6 5.4 12.3Z";
const I = {
  bird: `<svg viewBox="0 0 24 24" class="bird" aria-hidden="true"><path d="${BIRD}"/></svg>`,
  x: ico(`<path d="M6 6l12 12M18 6 6 18"/>`),
  back: ico(`<path d="M15 4.5 7.5 12l7.5 7.5"/>`),
  chev: ico(`<path d="m9 5 7 7-7 7"/>`),
  search: ico(`<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>`),
  mail: ico(`<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>`),
  pin: ico(`<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>`),
  clock: ico(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`),
  people: ico(`<circle cx="9" cy="8.5" r="3.3"/><path d="M3.2 19c.6-3.3 3-5.2 5.8-5.2s5.2 1.9 5.8 5.2"/><circle cx="16.8" cy="9.5" r="2.6"/><path d="M15.6 13.9c2.6-.4 4.7 1.2 5.2 4.2"/>`),
  bubble: ico(`<path d="M12 4C7 4 3 7.2 3 11.2c0 2.2 1.2 4.1 3.1 5.4L5.5 20l3.9-2c.8.2 1.7.3 2.6.3 5 0 9-3.2 9-7.1S17 4 12 4Z"/>`),
  key: ico(`<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2"/>`),
  lock: ico(`<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`),
  phone: ico(`<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>`),
  star: ico(`<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6Z"/>`),
  out: ico(`<path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7"/><path d="M11 12h9.5M17 8.5l3.5 3.5-3.5 3.5"/>`),
  link: ico(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  trash: ico(`<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>`),
  gift: ico(`<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3.5 9h17M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9Zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9Z"/>`),
  plane: ico(`<path d="M20 4 4 10.8l6.9 2.3L13.2 20Z"/>`),
};

/* ---------- talking to the server ---------- */
async function call(path, { method = "GET", body } = {}) {
  const headers = { "X-InFlight-Admin": "1" };
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: r.status });
  return data;
}

const A = { users: [], totals: {}, log: [], q: "", email: false, from: "", testTo: "", sheet: null, link: null, busy: null };
const root = () => $("#adm");
const user = (id) => A.users.find((u) => u.id === id);

/* ---------- shared bits ---------- */
function avatar(u, size = "") {
  const img = u.avatar_at ? `<img src="/api/pigeon/admin-avatar/${encodeURIComponent(u.id)}?v=${u.avatar_at}" alt="" loading="lazy">` : esc(initials(u.name));
  return `<span class="av ${size}" data-c="${hue(u.name)}" aria-hidden="true">${img}${online(u) ? '<i class="online"></i>' : ""}</span>`;
}
const cell = ({ a, id, icon, tile, label, sub, val, chev, cls = "", tag, attrs = "" }) => {
  const t = tag || (a ? "button" : "div");
  return `<${t} class="cell${icon ? " has-icon" : ""} ${cls}"${a ? ` data-a="${a}"` : ""}${id ? ` data-id="${esc(id)}"` : ""}${t === "button" ? ' type="button"' : ""} ${attrs}>
    ${icon ? `<span class="tile ${tile || "blue"}">${icon}</span>` : ""}
    <span class="ctext"><span>${label}</span>${sub ? `<span class="csub">${sub}</span>` : ""}</span>
    ${val != null ? `<span class="val">${val}</span>` : ""}${chev ? I.chev.replace('class="ico"', 'class="ico chev"') : ""}</${t}>`;
};
const LOG = {
  "pigeons-added": ["Pigeons given", "gift", "orange"], "test-email": ["Test email sent", "mail", "blue"],
  "reset-emailed": ["Reset link emailed", "mail", "blue"], "reset-link": ["Reset link made", "link", "indigo"],
  "reset-used": ["Password reset", "key", "green"], "signed-out": ["Signed out everywhere", "out", "gray"], deleted: ["Account deleted", "trash", "red"],
};
const logRow = (l) => { const [label, icon, tile] = LOG[l.action] || [l.action, "clock", "gray"];
  return cell({ icon: I[icon], tile, label: esc(label), sub: `${esc(l.detail || "")}${l.detail ? " · " : ""}${fmtSeen(l.at)}` }); };

/* ---------- sign in (owner) ---------- */
function vSignIn(msg) {
  closeSheet(true);
  root().innerHTML = `<div class="auth adm-auth">
    <div class="appicon">${I.bird}</div>
    <h1>InFlight Admin</h1>
    <form id="pwform" novalidate>
      <div class="group"><label class="fcell"><input id="f-pw" type="password" placeholder="Owner password" autocomplete="current-password" aria-label="Owner password"></label></div>
      <p class="gfoot bad" role="alert"${msg ? "" : " hidden"}>${esc(msg || "")}</p>
      <div class="stack"><button class="btn wide">Sign In</button>
      ${window.PublicKeyCredential ? `<button type="button" class="btn wide tinted" id="pk">${I.key} Sign In with a Passkey</button>` : ""}</div>
    </form>
  </div>`;
  $("#f-pw").focus();
  $("#pwform").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await call("/api/login", { method: "POST", body: { password: $("#f-pw").value } }); boot(); }
    catch (err) { vSignIn(err.message); }
  });
  $("#pk")?.addEventListener("click", async () => {
    try {
      const opt = await call("/api/passkeys", { method: "POST", body: { action: "auth-options" } });
      const a = await navigator.credentials.get({ publicKey: { challenge: b64u.dec(opt.challenge), rpId: opt.rpId, userVerification: "preferred", timeout: 60000,
        allowCredentials: (opt.allowCredentials || []).map((id) => ({ type: "public-key", id: b64u.dec(id) })) } });
      const r = a.response;
      await call("/api/passkeys", { method: "POST", body: { action: "auth-verify", id: b64u.enc(a.rawId),
        authenticatorData: b64u.enc(r.authenticatorData), clientDataJSON: b64u.enc(r.clientDataJSON), signature: b64u.enc(r.signature) } });
      boot();
    } catch (err) { if (err.name !== "NotAllowedError") vSignIn(err.message); }
  });
}

/* ---------- the dashboard ---------- */
function urow(u) {
  const on = online(u);
  return `<button class="cell urow" data-a="open" data-id="${esc(u.id)}" type="button">${avatar(u, "m")}
    <span class="ctext"><span class="one">${esc(u.name)}</span><span class="csub one">@${esc(u.handle)}${u.place ? ` · ${esc(u.place)}` : ""}</span></span>
    <span class="val${on ? " on-now" : ""}">${on ? "Online" : fmtSeen(u.last_seen)}</span>${I.chev.replace('class="ico"', 'class="ico chev"')}</button>`;
}
function vList() {
  const q = A.q.trim().toLowerCase();
  const list = q ? A.users.filter((u) => `${u.name} ${u.handle} ${u.email} ${u.place || ""}`.toLowerCase().includes(q)) : A.users;
  return list.length ? `<div class="group">${list.map(urow).join("")}</div>`
    : `<p class="empty">${A.users.length ? "No accounts match." : "No one has signed up yet."}</p>`;
}
function render() {
  const onlineN = A.users.filter(online).length, testSender = /@resend\.dev>?$/.test(A.from);
  const stat = (n, label, icon, tile) => `<div class="kpi"><span class="tile ${tile}">${icon}</span><b>${Number(n || 0).toLocaleString("en-GB")}</b><span>${label}</span></div>`;
  root().innerHTML = `<div class="adm-screen">
    <div class="navbar root b1"><div class="nb-left"></div><div class="nb-title one">Admin</div>
      <div class="nb-right"><button class="nbtn" type="button" data-a="signout" aria-label="Sign out">${I.out}</button></div></div>
    <h1 class="large">Admin</h1>
    <div class="kpis">
      ${stat(A.users.length, "Accounts", I.people, "blue")}${stat(onlineN, "Online Now", I.clock, "green")}
      ${stat(A.totals.flying, "In Flight", I.bird, "orange")}${stat(A.totals.msgs, "Scrolls", I.bubble, "indigo")}
    </div>
    <label class="search">${I.search}<input type="search" id="q" placeholder="Search accounts" value="${esc(A.q)}" autocomplete="off" aria-label="Search accounts"></label>
    <div class="ghead">${A.users.length} Account${A.users.length === 1 ? "" : "s"}</div>
    <div id="ulist">${vList()}</div>
    <div class="ghead">Email</div>
    <div class="group">
      ${cell({ icon: I.mail, tile: A.email ? "green" : "gray", label: "Reset Emails", val: A.email ? "On" : "Off" })}
      ${A.email ? cell({ a: "testmail", label: "Send a Test Email", cls: "blue" }) : ""}
    </div>
    <div class="gfoot">${!A.email ? "Add <b>RESEND_API_KEY</b> in Cloudflare to switch reset emails on. Until then, use “Make a Reset Link” on an account."
      : testSender ? `Emails can only reach your own Resend address until you verify your domain and set PIGEON_FROM. Tests go to ${esc(A.testTo)}.` : `Sent from ${esc(A.from)}.`}</div>
    <div class="ghead">Recent Activity</div>
    <div class="group">${A.log.slice(0, 5).map(logRow).join("") || cell({ label: "Nothing yet", cls: "muted" })}
      ${A.log.length > 5 ? cell({ a: "activity", label: "Show All", chev: true, cls: "blue" }) : ""}</div>
    <p class="adm-foot">InFlight admin · sees account details, never passwords, keys or scrolls.</p>
  </div>`;
  onScroll();
  if (A.sheet) drawSheet();
}

/* ---------- sheets (the app's bottom sheets) ---------- */
const sheetHtml = (title, body, back) => `<div class="scrim" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div>
  <header><span class="l">${back ? `<button type="button" class="nbtn" data-a="${back}" aria-label="Back">${I.back}</button>` : ""}</span><h3>${esc(title)}</h3>
  <span class="r"><button type="button" class="nbtn" data-a="close" aria-label="Close">${I.x}</button></span></header><div class="body">${body}</div></div>`;
const GIFTS = [["rocket", "Rocket", 1, "9× faster · 1 a day"], ["turbo", "Turbo", 3, "3× faster · 3 a day"], ["swift", "Swift", 9, "2× faster · 9 a day"]];
function vUser(u) {
  const busy = (a) => (A.busy === a ? " busy" : "");
  const link = A.link?.id === u.id ? A.link : null;
  return `<div class="profile-head">${avatar(u, "xl")}<span class="name">${esc(u.name)}</span><span class="sub">@${esc(u.handle)}${online(u) ? ' · <span class="on-now">Online now</span>' : ""}</span></div>
    <div class="group mt">
      ${cell({ icon: I.mail, tile: "blue", label: "Email", val: `<span class="sel">${esc(u.email)}</span>` })}
      ${cell({ icon: I.pin, tile: "blue", label: "Location", val: esc(u.place || "Not set") })}
      ${cell({ icon: I.clock, tile: "green", label: "Last Online", val: online(u) ? '<span class="on-now">Online now</span>' : fmtSeen(u.last_seen) })}
      ${cell({ icon: I.star, tile: "orange", label: "Joined", val: fmtDate(u.created_at) })}
    </div>
    <div class="group mt">
      ${cell({ icon: I.people, tile: "teal", label: "Friends", val: u.friends })}
      ${cell({ icon: I.bubble, tile: "indigo", label: "Scrolls Sent", val: u.sent })}
      ${cell({ icon: I.phone, tile: "gray", label: "Signed In On", val: `${u.sessions} device${u.sessions === 1 ? "" : "s"}` })}
      ${cell({ icon: I.key, tile: "indigo", label: "Passkeys", val: u.passkeys ? `${u.passkeys}${u.unlocking ? ` · ${u.unlocking} unlock${u.unlocking === 1 ? "s" : ""}` : ""}` : "None" })}
    </div>
    <div class="ghead">Pigeons</div>
    <div class="group">${GIFTS.map(([k, name, max, sub]) => { const n = u.pigeons?.[k] ?? 0;
      return `<div class="cell has-icon loft"><span class="tile ${k}">${I.bird}</span><span class="ctext"><span>${name}</span><span class="csub">${sub}</span></span>
        <b class="lcount${n > max ? " extra" : ""}" aria-label="${n} ${name.toLowerCase()} pigeons">${n}</b>
        <span class="give"><button type="button" class="btn small tinted${busy(`give-${k}-1`)}" data-a="give" data-k="${k}" data-n="1" aria-label="Give 1 ${name.toLowerCase()} pigeon">+1</button><button type="button" class="btn small tinted${busy(`give-${k}-5`)}" data-a="give" data-k="${k}" data-n="5" aria-label="Give 5 ${name.toLowerCase()} pigeons">+5</button></span></div>`; }).join("")}</div>
    <div class="gfoot">Gifts can go past a full loft. Extras stay until they’re used, and reach the app within 15 seconds. Standard pigeons are unlimited.</div>
    <div class="ghead">Password</div>
    <div class="group">
      ${cell({ a: "email", icon: I.mail, tile: "blue", label: "Email a Reset Link", cls: `blue${busy("email")}`, attrs: A.email ? "" : "disabled" })}
      ${cell({ a: "link", icon: I.link, tile: "indigo", label: "Make a Reset Link", cls: `blue${busy("link")}` })}
    </div>
    ${link ? `<div class="group mt-s linkcell"><div class="cell"><code class="sel">${esc(link.url)}</code></div>${cell({ a: "copy", label: "Copy Link", cls: "blue center" })}</div>
      <div class="gfoot">Works once, for 24 hours. Send it to them privately.</div>`
      : `<div class="gfoot">${A.email ? `The email goes to ${esc(u.email)} and works for one hour.` : "Reset emails are off, so make a link and send it yourself."}</div>`}
    <div class="group mt">${cell({ a: "signoutuser", label: "Sign Out Everywhere", cls: `center blue${busy("signoutuser")}`, attrs: u.sessions ? "" : "disabled" })}</div>
    <div class="group mt">${cell({ a: "delask", label: "Delete Account", cls: "center destructive" })}</div>`;
}
const vDelete = (u) => `<div class="profile-head">${avatar(u, "l")}<span class="name">Delete @${esc(u.handle)}?</span></div>
  <p class="adm-warn">This deletes ${esc(u.name)}’s account and every scroll they sent or received. It can’t be undone.</p>
  <form data-f="delete" novalidate>
    <div class="group"><label class="fcell"><input name="c" placeholder="Type ${esc(u.handle)} to confirm" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type the handle to confirm"></label></div>
    <p class="gfoot bad" role="alert" hidden></p>
    <div class="stack"><button class="btn wide danger" type="submit">Delete Account</button></div>
  </form>`;
const vActivity = () => `<div class="group mt-s">${A.log.map(logRow).join("") || cell({ label: "Nothing yet", cls: "muted" })}</div>
  <div class="gfoot">The last 100 admin actions.</div>`;
function drawSheet() {
  const s = A.sheet, layer = $("#layer");
  const u = s.id && user(s.id);
  if ((s.type === "user" || s.type === "delete") && !u) return closeSheet();
  const [title, body, back] = s.type === "user" ? [u.name, vUser(u)] : s.type === "delete" ? ["Delete Account", vDelete(u), "deleteback"] : ["Admin Activity", vActivity()];
  const fresh = !$(".sheet", layer) || layer.dataset.type !== s.type;
  const scroll = $(".sheet .body", layer)?.scrollTop || 0;
  layer.innerHTML = sheetHtml(title, body, back);
  layer.dataset.type = s.type;
  if (!fresh) { layer.querySelectorAll(".sheet,.scrim").forEach((e) => e.classList.add("still")); $(".sheet .body", layer).scrollTop = scroll; }
  else if (A.sheetFrom) { layer.querySelectorAll(".sheet,.scrim").forEach((e) => e.classList.add("still")); $(".sheet .body", layer).classList.add("swap"); }
  A.sheetFrom = null;
  document.body.classList.add("sheeted");
}
function openSheet(s) { const was = A.sheet; A.sheet = s; A.sheetFrom = was ? was.type : null; drawSheet(); }
let closeTimer = 0;
function closeSheet(now) {
  A.sheet = null; A.link = null;
  const layer = $("#layer"); if (!layer) return;
  document.body.classList.remove("sheeted");
  clearTimeout(closeTimer);
  if (now || !$(".sheet", layer)) { layer.innerHTML = ""; return; }
  layer.querySelectorAll(".sheet,.scrim").forEach((e) => { e.classList.remove("still"); e.classList.add("closing"); });
  closeTimer = setTimeout(() => { if (!A.sheet) layer.innerHTML = ""; }, 320);
}

/* ---------- toasts ---------- */
let toastTimer = 0;
function toast(msg, bad) {
  const t = $("#toasts");
  t.innerHTML = `<div class="toast${bad ? " bad" : ""}" role="status"><span class="ticon">${I.bird}</span><span>${esc(msg)}</span></div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { const e = $(".toast", t); if (e) { e.classList.add("out"); setTimeout(() => e.remove(), 350); } }, 4000);
}

/* ---------- the large title folds into the bar as you scroll, as in the app ---------- */
function onScroll() {
  const s = $(".adm-screen"); if (!s) return;
  const y = window.scrollY;
  s.classList.toggle("scrolled", y > 20);
  s.classList.toggle("titled", y > 44);
}
addEventListener("scroll", onScroll, { passive: true });

async function load() {
  const [u, l] = await Promise.all([call("/api/pigeon/admin-users"), call("/api/pigeon/admin-log")]);
  A.users = u.users; A.totals = u.totals || {}; A.log = l.log;
}
async function refresh() { try { await load(); render(); } catch (err) { if (err.status === 401) vSignIn("Your admin session ended. Sign in again."); } }
async function boot() {
  let st;
  try { st = await call("/api/pigeon/admin-status"); }
  catch (err) { root().innerHTML = `<p class="empty">${esc(err.message)}</p>`; return; }
  if (!st.configured) { root().innerHTML = `<div class="auth adm-auth"><div class="appicon">${I.bird}</div><h1>InFlight Admin</h1><p class="sub">The site owner password (EDIT_PASSWORD) isn’t set on this server, so there’s no admin sign-in.</p></div>`; return; }
  if (!st.authed) return vSignIn();
  A.email = !!st.email; A.from = st.from || ""; A.testTo = st.testTo || "";
  try { await load(); render(); }
  catch (err) { if (err.status === 401) vSignIn(); else root().innerHTML = `<p class="empty">${esc(err.message)}</p>`; }
}
// keep "Online" and "last seen" current while the page is open
setInterval(() => { if (document.visibilityState === "visible" && $(".adm-screen") && !A.busy) refresh(); }, 30e3);

/* ---------- actions ---------- */
document.addEventListener("input", (e) => { if (e.target.id === "q") { A.q = e.target.value; $("#ulist").innerHTML = vList(); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && A.sheet) closeSheet(); });
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
  const act = b.dataset.a, id = A.sheet?.id;
  if (act === "close") return closeSheet();
  if (act === "open") return openSheet({ type: "user", id: b.dataset.id });
  if (act === "activity") return openSheet({ type: "activity" });
  if (act === "delask") return openSheet({ type: "delete", id });
  if (act === "deleteback") return openSheet({ type: "user", id });
  if (act === "signout") { await fetch("/api/logout", { method: "POST" }); return vSignIn(); }
  if (act === "copy") {
    try { await navigator.clipboard.writeText(A.link.url); toast("Link copied."); }
    catch (_) { const c = $(".linkcell code"); const r = document.createRange(); r.selectNodeContents(c); getSelection().removeAllRanges(); getSelection().addRange(r); }
    return;
  }
  const routes = {
    testmail: ["admin-test-email", {}], email: ["admin-reset", { id, mode: "email" }], link: ["admin-reset", { id, mode: "link" }],
    signoutuser: ["admin-signout", { id }], give: ["admin-pigeons", { id, kind: b.dataset.k, add: +b.dataset.n }],
  };
  if (!routes[act]) return;
  A.busy = act === "give" ? `give-${b.dataset.k}-${b.dataset.n}` : act;
  if (A.sheet) drawSheet(); else b.disabled = true;
  try {
    const r = await call("/api/pigeon/" + routes[act][0], { method: "POST", body: routes[act][1] });
    if (r.url) A.link = { id, url: r.url };
    toast(r.message);
    A.busy = null; await load();
  } catch (err) {
    A.busy = null;
    if (err.status === 401) return vSignIn("Your admin session ended. Sign in again.");
    toast(err.message, true);
  }
  render();
});
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-f=delete]"); if (!f) return;
  e.preventDefault();
  const id = A.sheet?.id, err = $(".gfoot.bad", f);
  try {
    const r = await call("/api/pigeon/admin-delete", { method: "POST", body: { id, confirm: f.c.value } });
    closeSheet(); await load(); render(); toast(r.message);
  } catch (x) { err.textContent = x.message; err.hidden = false; }
});
boot();
