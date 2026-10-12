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

const A = { users: [], totals: {}, log: [], q: "", email: false, from: "", testTo: "", results: {}, confirming: null, mail: null, open: null };
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
const chev = `<svg viewBox="0 0 24 24" class="ico chev" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`;
// One row per account: tap the name to open its options.
function userRow(u) {
  const res = A.results[u.id], open = A.open === u.id, confirming = A.confirming === u.id;
  return `<article class="ucard${open ? " open" : ""}" data-id="${esc(u.id)}">
    <button class="uname" data-a="toggle" aria-expanded="${open}">
      <span class="av s" aria-hidden="true">${esc(u.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase())}</span>
      <span class="who"><span class="nm">${esc(u.name)}</span><span class="sub">@${esc(u.handle)}</span></span>${chev}
    </button>
    ${open ? `<div class="upanel">
      <p class="facts">${esc(u.email)} · last active ${ago(u.last_seen)}</p>
      <div class="uacts">
        <button class="btn" data-a="email"${A.email ? "" : ' disabled title="Email isn’t set up yet"'}>Email a reset link</button>
        <button class="btn ghost" data-a="link">Make a reset link</button>
        <button class="btn ghost" data-a="signout"${u.sessions ? "" : ' disabled title="Not signed in anywhere"'}>Sign out everywhere</button>
      </div>
      ${res ? `<div class="result${res.bad ? " bad" : ""}" role="status"><span>${esc(res.message)}</span>
        ${res.url ? `<div class="linkbox"><code>${esc(res.url)}</code><button class="btn" data-a="copy" data-url="${esc(res.url)}">Copy</button></div>` : ""}</div>` : ""}
      ${confirming ? `<form class="confirm" data-f="delete"><span>This deletes the account and every scroll it sent or received. Type <b>${esc(u.handle)}</b> to confirm.</span>
        <label class="field"><input name="c" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type the handle to confirm"></label>
        <button class="btn" type="submit">Delete account</button><button class="btn ghost" type="button" data-a="delcancel">Cancel</button></form>`
        : `<button class="link danger" data-a="delask">Delete account…</button>`}
    </div>` : ""}
  </article>`;
}
function render() {
  const q = A.q.trim().toLowerCase();
  const list = q ? A.users.filter((u) => `${u.name} ${u.handle} ${u.email}`.toLowerCase().includes(q)) : A.users;
  const focus = document.activeElement?.id;
  const testSender = /@resend\.dev>?$/.test(A.from);
  root().innerHTML = `
    <header class="adm-top"><h1>InFlight admin <span class="beta">Beta</span></h1>
      <span class="tools"><span class="pillstat${A.email ? "" : " off"}">${A.email ? "Reset emails on" : "Reset emails off"}</span>
      <button class="btn ghost" id="signout">Sign out</button></span></header>
    ${!A.email ? `<p class="anote">Reset emails are off. Add <b>RESEND_API_KEY</b> in Cloudflare to switch them on. Until then, use “Make a reset link”.</p>`
      : testSender ? `<p class="anote">Reset emails can only reach your own Resend address until you verify your domain and set PIGEON_FROM. <button class="link" data-a="testmail">Send a test email</button></p>` : ""}
    ${A.mail ? `<div class="result${A.mail.bad ? " bad" : ""}" role="status">${esc(A.mail.message)}</div>` : ""}
    <div class="searchrow"><label class="field"><input id="q" placeholder="Search accounts" value="${esc(A.q)}" autocomplete="off" aria-label="Search accounts"></label><small>${list.length} account${list.length === 1 ? "" : "s"}</small></div>
    <section class="ulist">${list.map(userRow).join("") || `<p class="empty">${A.users.length ? "No accounts match." : "No one has signed up yet."}</p>`}</section>
    <details class="logwrap"><summary>Admin activity</summary>
      <ul class="logl">${A.log.map((l) => `<li><time>${fmtWhen(l.at)}</time><span>${esc(LOG[l.action] || l.action)}${l.detail ? ` · ${esc(l.detail)}` : ""}</span></li>`).join("") || `<li><span>Nothing yet.</span></li>`}</ul></details>`;
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
  if (act === "toggle") { A.open = A.open === id ? null : id; A.confirming = null; return render(); }
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
