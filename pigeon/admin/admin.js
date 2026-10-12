// InFlight admin. Uses the site owner's sign-in (the same password or passkey
// as the key icon on the home page). Shows account details only: passwords,
// private keys and scrolls never reach the server in readable form.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const fmtWhen = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
function ago(t) {
  if (!t) return "never";
  const m = (Date.now() - t) / 60e3;
  if (m < 2) return "just now";
  if (m < 60) return `${Math.floor(m)} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} days ago`;
}
const b64u = {
  enc(buf) { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  dec(str) { str = String(str).replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "="; return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)); },
};

async function call(path, { method = "GET", body } = {}) {
  const headers = { "X-InFlight-Admin": "1" };
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: r.status });
  return data;
}

const A = { users: [], totals: {}, log: [], q: "", email: false, from: "", testTo: "", results: {}, confirming: null, mail: null };
const root = () => $("#adm");

/* ---------- sign in (owner) ---------- */
function vSignIn(msg) {
  root().innerHTML = `<div class="signcard">
    <h1>InFlight admin</h1>
    <p class="anote">Sign in with your site owner password or passkey, the same ones as the key icon on georgefarrowgreen.com.</p>
    <form class="fields" id="pwform" novalidate>
      <label class="fl" for="f-pw"><span class="lbl">Owner password</span><span class="inp"><input id="f-pw" type="password" autocomplete="current-password"></span></label>
      <p class="ferr" role="alert"${msg ? "" : " hidden"}>${esc(msg || "")}</p>
      <button class="btn big">Sign in</button>
    </form>
    ${window.PublicKeyCredential ? `<button class="btn big ghost" id="pk">Sign in with a passkey</button>` : ""}
  </div>`;
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

/* ---------- dashboard ---------- */
function stats() {
  const week = Date.now() - 7 * 864e5;
  return `<div class="stats">
    <div class="stat"><b>${A.users.length}</b><span>Accounts</span></div>
    <div class="stat"><b>${A.users.filter((u) => u.last_seen && u.last_seen > week).length}</b><span>Active this week</span></div>
    <div class="stat"><b>${A.totals.msgs || 0}</b><span>Scrolls sent</span></div>
    <div class="stat"><b>${A.totals.flying || 0}</b><span>In flight now</span></div>
  </div>`;
}
function userCard(u) {
  const res = A.results[u.id];
  const confirming = A.confirming === u.id;
  return `<article class="ucard" data-id="${esc(u.id)}">
    <div class="uhead"><span class="av s" aria-hidden="true">${esc(u.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase())}</span>
      <div class="who"><span class="nm">${esc(u.name)}</span><span class="sub">@${esc(u.handle)} · ${esc(u.email)}</span></div></div>
    <div class="facts">
      <span>Joined <b>${fmtDate(u.created_at)}</b></span>
      <span>Last active <b>${ago(u.last_seen)}</b></span>
      <span>Signed in on <b>${u.sessions}</b> device${u.sessions === 1 ? "" : "s"}</span>
      <span>Passkeys <b>${u.passkeys}</b>${u.passkeys ? ` (${u.unlocking} can keep scrolls on reset)` : ""}</span>
      <span>Friends <b>${u.friends}</b></span>
      <span>Scrolls sent <b>${u.sent}</b></span>
      ${u.place ? `<span>Roost <b>${esc(u.place)}</b></span>` : ""}
    </div>
    <div class="uacts">
      <button class="btn ghost" data-a="email"${A.email ? "" : ' disabled title="Email isn’t set up yet"'}>Email a reset link</button>
      <button class="btn ghost" data-a="link">Make a reset link</button>
      <button class="btn ghost" data-a="signout"${u.sessions ? "" : " disabled"}>Sign out everywhere</button>
      <button class="btn danger-ghost" data-a="delask">Delete…</button>
    </div>
    ${confirming ? `<form class="confirm" data-f="delete"><span>This deletes the account and every scroll it sent or received. Type <b>${esc(u.handle)}</b> to confirm.</span>
      <label class="field"><input name="c" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type the handle to confirm"></label>
      <button class="btn" type="submit">Delete account</button><button class="btn ghost" type="button" data-a="delcancel">Cancel</button></form>` : ""}
    ${res ? `<div class="result${res.bad ? " bad" : ""}" role="status"><span>${esc(res.message)}</span>
      ${res.url ? `<div class="linkbox"><code>${esc(res.url)}</code><button class="btn" data-a="copy" data-url="${esc(res.url)}">Copy</button></div>` : ""}</div>` : ""}
  </article>`;
}
function render() {
  const q = A.q.trim().toLowerCase();
  const list = q ? A.users.filter((u) => `${u.name} ${u.handle} ${u.email}`.toLowerCase().includes(q)) : A.users;
  const focus = document.activeElement?.id;
  root().innerHTML = `
    <header class="adm-top"><h1>InFlight admin <span class="beta">Beta</span></h1>
      <span class="tools"><span class="pillstat${A.email ? "" : " off"}">${A.email ? "Reset emails on" : "Reset emails off"}</span>
      <button class="btn ghost" id="signout">Sign out</button></span></header>
    ${A.email ? `<div class="mailrow"><p class="anote">Emails go out from <b>${esc(A.from)}</b>.${/@resend\.dev>?$/.test(A.from) ? " That’s Resend’s test sender: it can only email your own Resend address, so verify your domain and set PIGEON_FROM before people can get reset emails." : ""}</p>
        <button class="btn ghost" data-a="testmail">Send a test email</button></div>
        ${A.mail ? `<div class="result${A.mail.bad ? " bad" : ""}" role="status">${esc(A.mail.message)}</div>` : ""}`
      : `<p class="anote">Reset emails need a Resend API key. In Cloudflare → your Pages project → Settings → Variables and Secrets, add <b>RESEND_API_KEY</b> as a Secret, then redeploy. Until then, use “Make a reset link” and send the link yourself.</p>`}
    ${stats()}
    <div class="searchrow"><label class="field"><input id="q" placeholder="Search by name, handle or email" value="${esc(A.q)}" autocomplete="off" aria-label="Search accounts"></label><small>${list.length} of ${A.users.length}</small></div>
    <section class="users">${list.map(userCard).join("") || `<p class="empty">${A.users.length ? "No accounts match." : "No one has signed up yet."}</p>`}</section>
    <p class="anote">You can see account details, not passwords, private keys or scrolls: those never reach the server in readable form. A reset link lets someone choose a new password. If they have a passkey that unlocks their key, they keep their scrolls. Otherwise they start with a new key, older scrolls can’t be opened, and their friends see a key-change warning.</p>
    <h2>Admin activity</h2>
    <ul class="logl">${A.log.map((l) => `<li><time>${fmtWhen(l.at)}</time><span>${esc(LOG[l.action] || l.action)}${l.detail ? ` · ${esc(l.detail)}` : ""}</span></li>`).join("") || `<li><span>Nothing yet.</span></li>`}</ul>`;
  if (focus === "q") { const i = $("#q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
const LOG = { "test-email": "Test email sent", "reset-emailed": "Reset link emailed", "reset-link": "Reset link made", "reset-used": "Password reset", "signed-out": "Signed out everywhere", deleted: "Account deleted" };

async function load() {
  const [u, l] = await Promise.all([call("/api/pigeon/admin-users"), call("/api/pigeon/admin-log")]);
  A.users = u.users; A.totals = u.totals || {}; A.log = l.log;
}
async function boot() {
  let st;
  try { st = await call("/api/pigeon/admin-status"); }
  catch (err) { root().innerHTML = `<p class="empty">${esc(err.message)}</p>`; return; }
  if (!st.configured) { root().innerHTML = `<div class="signcard"><h1>InFlight admin</h1><p class="anote">The site owner password (EDIT_PASSWORD) isn’t set on this server, so there’s no admin sign-in.</p></div>`; return; }
  if (!st.authed) return vSignIn();
  A.email = !!st.email; A.from = st.from || ""; A.testTo = st.testTo || "";
  try { await load(); render(); }
  catch (err) { if (err.status === 401) vSignIn(); else root().innerHTML = `<p class="empty">${esc(err.message)}</p>`; }
}

document.addEventListener("input", (e) => { if (e.target.id === "q") { A.q = e.target.value; render(); } });
document.addEventListener("click", async (e) => {
  if (e.target.id === "signout") { await fetch("/api/logout", { method: "POST" }); return vSignIn(); }
  const b = e.target.closest("[data-a]"); if (!b) return;
  if (b.dataset.a === "testmail") {
    b.disabled = true; b.textContent = "Sending…";
    try { A.mail = { message: (await call("/api/pigeon/admin-test-email", { method: "POST", body: {} })).message }; await load(); }
    catch (err) { if (err.status === 401) return vSignIn("Your admin session ended. Sign in again."); A.mail = { message: err.message, bad: true }; }
    return render();
  }
  const id = b.closest(".ucard")?.dataset.id;
  const act = b.dataset.a;
  if (act === "copy") {
    try { await navigator.clipboard.writeText(b.dataset.url); b.textContent = "Copied"; }
    catch (_) { const c = b.parentElement.querySelector("code"); const r = document.createRange(); r.selectNodeContents(c); getSelection().removeAllRanges(); getSelection().addRange(r); }
    return;
  }
  if (act === "delask") { A.confirming = id; render(); $(`.ucard[data-id="${id}"] .confirm input`)?.focus(); return; }
  if (act === "delcancel") { A.confirming = null; return render(); }
  const routes = { email: ["admin-reset", { mode: "email" }], link: ["admin-reset", { mode: "link" }], signout: ["admin-signout", {}] };
  if (!routes[act]) return;
  b.disabled = true;
  try {
    const r = await call("/api/pigeon/" + routes[act][0], { method: "POST", body: { id, ...routes[act][1] } });
    A.results[id] = { message: r.message, url: r.url };
    await load();
  } catch (err) {
    if (err.status === 401) return vSignIn("Your admin session ended. Sign in again.");
    A.results[id] = { message: err.message, bad: true };
  }
  render();
});
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-f=delete]"); if (!f) return;
  e.preventDefault();
  const id = f.closest(".ucard").dataset.id;
  try {
    const r = await call("/api/pigeon/admin-delete", { method: "POST", body: { id, confirm: f.c.value } });
    A.confirming = null; await load(); render();
    root().insertAdjacentHTML("afterbegin", `<div class="result" role="status">${esc(r.message)}</div>`);
  } catch (err) { A.results[id] = { message: err.message, bad: true }; render(); }
});
boot();
