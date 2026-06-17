/* ----------------------------------------------------------------------
   Personal bio page — front-end logic
   - Loads content from /api/content (Cloudflare Pages Function + KV)
   - Falls back to embedded defaults if the API isn't wired up
   - Password login via /api/login; edits saved via PUT /api/content
   - Inline link editor (with icons + reordering) and photo upload
---------------------------------------------------------------------- */

const els = {
  name: document.getElementById("f-name"),
  role: document.getElementById("f-role"),
  bio: document.getElementById("f-bio"),
  nameFoot: document.getElementById("f-name-foot"),
  avatar: document.getElementById("avatar"),
  monogram: document.getElementById("monogram"),
  links: document.getElementById("links"),
  year: document.getElementById("year"),
  card: document.getElementById("bio-card"),
  glow: document.querySelector(".card-glow"),
  photoInput: document.getElementById("photo-input"),
  // login
  openLogin: document.getElementById("open-login"),
  modal: document.getElementById("login-modal"),
  loginForm: document.getElementById("login-form"),
  password: document.getElementById("password"),
  loginError: document.getElementById("login-error"),
  loginCancel: document.getElementById("login-cancel"),
  // link editor
  linkModal: document.getElementById("link-modal"),
  linkForm: document.getElementById("link-form"),
  linkLabel: document.getElementById("link-label"),
  linkUrl: document.getElementById("link-url"),
  linkTitle: document.getElementById("link-modal-title"),
  linkMove: document.getElementById("link-move"),
  linkMoveLeft: document.getElementById("link-move-left"),
  linkMoveRight: document.getElementById("link-move-right"),
  linkRemove: document.getElementById("link-remove"),
  linkCancel: document.getElementById("link-cancel"),
  // toolbar
  toolbar: document.getElementById("toolbar"),
  toolbarStatus: document.getElementById("toolbar-status"),
  addLink: document.getElementById("add-link"),
  save: document.getElementById("save"),
  logout: document.getElementById("logout"),
};

const DEFAULT_CONTENT = {
  name: "George Farrow Green",
  role: "Curious human · builder of things",
  bio:
    "This is a placeholder bio. Log in with your password to edit it — share a " +
    "few warm sentences about who you are, what you make, and what you're into.",
  avatar: "",
  links: [
    { label: "Email", url: "mailto:georgefarrowgreen@icloud.com" },
    { label: "GitHub", url: "https://github.com/georgefarrowgreen1" },
  ],
};

let state = structuredClone(DEFAULT_CONTENT);
let editing = false;
let editingLinkIndex = null; // null = adding a new link

/* ---------------- Icons ---------------- */
// Returns an inline SVG string for a known service, else a generic link glyph.
// SVGs are author-controlled (not user input), so innerHTML is safe here.
const ICONS = {
  mail: '<path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2.2V18h16V7.2l-8 5.3-8-5.3Z"/>',
  github: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85l-.01 2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>',
  linkedin: '<path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.07 1.4-2.07 2.85V21H9V9Z"/>',
  x: '<path d="M17.5 3h3l-7.1 8.1L22 21h-6.4l-4.6-6-5.3 6H2.7l7.6-8.7L2 3h6.6l4.2 5.5L17.5 3Zm-1.1 16h1.7L7.7 4.8H5.9L16.4 19Z"/>',
  instagram: '<path d="M12 8.6A3.4 3.4 0 1 0 12 15.4 3.4 3.4 0 0 0 12 8.6Zm0-2.2c1.9 0 2.1 0 2.85.04 2.2.1 3.27 1.17 3.37 3.37.04.75.04.95.04 2.85s0 2.1-.04 2.85c-.1 2.2-1.17 3.27-3.37 3.37-.75.04-.95.04-2.85.04s-2.1 0-2.85-.04c-2.2-.1-3.27-1.18-3.37-3.37C5.78 14.1 5.78 13.9 5.78 12s0-2.1.04-2.85c.1-2.2 1.17-3.27 3.37-3.37C9.94 5.74 10.14 5.74 12 5.74Zm0-1.74c-2.17 0-2.44.01-3.29.05C5.7 4.2 4.2 5.7 4.05 8.71 4.01 9.56 4 9.83 4 12s.01 2.44.05 3.29c.15 3.01 1.65 4.51 4.66 4.66.85.04 1.12.05 3.29.05s2.44-.01 3.29-.05c3.01-.15 4.51-1.65 4.66-4.66.04-.85.05-1.12.05-3.29s-.01-2.44-.05-3.29c-.15-3.01-1.65-4.51-4.66-4.66C14.44 4.01 14.17 4 12 4Zm5.85 3.35a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/>',
  link: '<path d="M10.6 13.4a3 3 0 0 0 4.24 0l3-3a3 3 0 0 0-4.24-4.24l-1.3 1.3M13.4 10.6a3 3 0 0 0-4.24 0l-3 3a3 3 0 1 0 4.24 4.24l1.3-1.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

function iconFor(url) {
  const u = (url || "").toLowerCase();
  if (u.startsWith("mailto:") || /^[^@\s]+@[^@\s]+$/.test(u)) return ICONS.mail;
  if (u.includes("github.com")) return ICONS.github;
  if (u.includes("linkedin.com")) return ICONS.linkedin;
  if (u.includes("twitter.com") || /\bx\.com/.test(u)) return ICONS.x;
  if (u.includes("instagram.com")) return ICONS.instagram;
  return ICONS.link;
}

/* ---------------- Rendering ---------------- */
function monogramFrom(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function render() {
  els.name.textContent = state.name || "";
  els.role.textContent = state.role || "";
  els.bio.textContent = state.bio || "";
  els.nameFoot.textContent = state.name || "";
  document.title = state.name || "Personal site";
  renderAvatar();
  renderLinks();
  updateStructuredData();
}

function updateStructuredData() {
  const el = document.getElementById("ld-person");
  if (!el) return;
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: state.name || "",
    url: "https://georgefarrowgreen.com/",
  };
  if (state.role) data.description = state.role;
  const sameAs = (state.links || [])
    .map((l) => sanitizeUrl(l.url))
    .filter((u) => /^https?:/.test(u));
  if (sameAs.length) data.sameAs = sameAs;
  if (state.avatar) data.image = "https://georgefarrowgreen.com/og.png";
  el.textContent = JSON.stringify(data);
}

function renderAvatar() {
  els.avatar.querySelector("img")?.remove();
  if (state.avatar) {
    const img = document.createElement("img");
    img.src = state.avatar;
    img.alt = state.name || "Profile photo";
    img.className = "avatar-img";
    els.avatar.appendChild(img);
    els.monogram.style.display = "none";
  } else {
    els.monogram.style.display = "";
    els.monogram.textContent = monogramFrom(state.name);
  }
}

function renderLinks() {
  els.links.innerHTML = "";
  state.links.forEach((link, i) => els.links.appendChild(makePill(link, i)));
}

function makePill(link, index) {
  const a = document.createElement("a");
  a.className = "pill";
  a.href = sanitizeUrl(link.url);
  if (!a.href.startsWith("mailto:")) {
    a.target = "_blank";
    a.rel = "noopener";
  }

  const icon = document.createElement("span");
  icon.className = "pill-icon";
  icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconFor(link.url)}</svg>`;
  a.appendChild(icon);

  const label = document.createElement("span");
  label.className = "pill-label";
  label.textContent = link.label || "Link";
  a.appendChild(label);

  a.addEventListener("click", (e) => {
    if (editing) {
      e.preventDefault();
      openLinkEditor(index);
    }
  });
  return a;
}

function sanitizeUrl(url) {
  const u = (url || "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(u)) return "mailto:" + u;
  if (u) return "https://" + u.replace(/^\/+/, "");
  return "#";
}

/* ---------------- Data fetch ---------------- */
async function loadContent() {
  try {
    const res = await fetch("/api/content", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      state = { ...structuredClone(DEFAULT_CONTENT), ...data };
      state.links = Array.isArray(state.links) ? state.links : [];
      render();
      return;
    }
  } catch (_) {
    /* backend not available — use defaults already in DOM */
  }
  render();
}

async function hasSession() {
  try {
    const res = await fetch("/api/session", { cache: "no-store" });
    if (res.ok) return !!(await res.json()).authed;
  } catch (_) {}
  return false;
}

// Owner-only entry point. Visitors never see edit UI; the owner triggers this
// via #edit or a triple-tap on the footer. A still-valid session skips the
// password prompt.
async function requestEdit() {
  if (editing) return;
  if (await hasSession()) enterEditMode();
  else openLogin();
}

/* ---------------- Edit mode ---------------- */
function enterEditMode() {
  editing = true;
  document.body.classList.add("editing");
  els.toolbar.hidden = false;
  [els.name, els.role, els.bio].forEach((el) => el.setAttribute("contenteditable", "true"));
  setStatus("Editing — tap a link to edit it", "");
}

function exitEditMode() {
  editing = false;
  document.body.classList.remove("editing");
  els.toolbar.hidden = true;
  [els.name, els.role, els.bio].forEach((el) => el.removeAttribute("contenteditable"));
}

function syncTextFromDom() {
  state.name = els.name.textContent.trim();
  state.role = els.role.textContent.trim();
  state.bio = els.bio.textContent.trim();
}

function setStatus(text, cls) {
  els.toolbarStatus.textContent = text;
  els.toolbarStatus.className = "toolbar-status" + (cls ? " " + cls : "");
}

async function save() {
  syncTextFromDom();
  setStatus("Saving…", "saving");
  try {
    const res = await fetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (res.status === 401) {
      setStatus("Session expired", "");
      exitEditMode();
      openLogin();
      return;
    }
    if (!res.ok) throw new Error("save failed");
    const data = await res.json();
    if (data.content) state = { ...structuredClone(DEFAULT_CONTENT), ...data.content };
    render();
    enterEditMode();
    setStatus("Saved ✓", "saved");
    setTimeout(() => editing && setStatus("Editing", ""), 2000);
  } catch (_) {
    setStatus("Save failed", "");
    alert(
      "Couldn't save. If you haven't set up the Cloudflare KV backend yet, see " +
      "the README — editing needs it to persist."
    );
  }
}

/* ---------------- Link editor ---------------- */
function openLinkEditor(index) {
  editingLinkIndex = index; // null when adding
  const isEdit = index !== null;
  els.linkTitle.textContent = isEdit ? "Edit link" : "Add link";
  els.linkLabel.value = isEdit ? state.links[index].label : "";
  els.linkUrl.value = isEdit ? state.links[index].url : "";
  els.linkRemove.hidden = !isEdit;
  els.linkMove.hidden = !isEdit;
  els.linkMoveLeft.disabled = !isEdit || index === 0;
  els.linkMoveRight.disabled = !isEdit || index === state.links.length - 1;
  if (typeof els.linkModal.showModal === "function") els.linkModal.showModal();
  setTimeout(() => els.linkLabel.focus(), 50);
}

els.addLink.addEventListener("click", () => openLinkEditor(null));
els.linkCancel.addEventListener("click", () => els.linkModal.close());

els.linkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const link = { label: els.linkLabel.value.trim(), url: els.linkUrl.value.trim() };
  if (!link.label || !link.url) {
    els.linkModal.close();
    return;
  }
  if (editingLinkIndex === null) state.links.push(link);
  else state.links[editingLinkIndex] = link;
  renderLinks();
  els.linkModal.close();
});

els.linkRemove.addEventListener("click", () => {
  if (editingLinkIndex !== null) {
    state.links.splice(editingLinkIndex, 1);
    renderLinks();
  }
  els.linkModal.close();
});

function moveLink(delta) {
  const i = editingLinkIndex;
  if (i === null) return;
  const j = i + delta;
  if (j < 0 || j >= state.links.length) return;
  [state.links[i], state.links[j]] = [state.links[j], state.links[i]];
  renderLinks();
  els.linkModal.close();
  openLinkEditor(j);
}
els.linkMoveLeft.addEventListener("click", () => moveLink(-1));
els.linkMoveRight.addEventListener("click", () => moveLink(1));

/* ---------------- Photo upload ---------------- */
els.avatar.addEventListener("click", () => {
  if (editing) els.photoInput.click();
});

els.photoInput.addEventListener("change", async () => {
  const file = els.photoInput.files && els.photoInput.files[0];
  els.photoInput.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    return;
  }
  try {
    state.avatar = await resizeImage(file, 320);
    renderAvatar();
    setStatus("Photo added — Save to keep it", "");
  } catch (_) {
    alert("Couldn't process that image.");
  }
});

// Center-crop to a square and downscale; returns a compact JPEG data URL.
function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ---------------- Login ---------------- */
function openLogin() {
  els.loginError.hidden = true;
  els.password.value = "";
  refreshPasskeyButton();
  if (typeof els.modal.showModal === "function") els.modal.showModal();
  setTimeout(() => els.password.focus(), 50);
}

els.openLogin.addEventListener("click", () => {
  if (editing) exitEditMode();
  else requestEdit();
});

els.loginCancel.addEventListener("click", () => els.modal.close());

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.loginError.hidden = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: els.password.value }),
    });
    if (res.ok) {
      els.modal.close();
      enterEditMode();
      return;
    }
    const data = await res.json().catch(() => ({}));
    els.loginError.textContent =
      data.error ||
      (res.status === 429 ? "Too many attempts — try again later." :
       res.status === 401 ? "Incorrect password." : "Login unavailable.");
    els.loginError.hidden = false;
  } catch (_) {
    els.loginError.textContent =
      "Login backend not reachable. See the README to set it up on Cloudflare.";
    els.loginError.hidden = false;
  }
});

els.logout.addEventListener("click", async () => {
  try { await fetch("/api/logout", { method: "POST" }); } catch (_) {}
  exitEditMode();
});

els.save.addEventListener("click", save);

/* ---------------- Passkeys (WebAuthn) ---------------- */
const pkEls = {
  loginBtn: document.getElementById("passkey-login"),
  divider: document.getElementById("login-divider"),
  manageBtn: document.getElementById("manage-passkeys"),
  modal: document.getElementById("passkey-modal"),
  list: document.getElementById("passkey-list"),
  add: document.getElementById("passkey-add"),
  close: document.getElementById("passkey-close"),
  error: document.getElementById("passkey-error"),
};

const b64u = {
  enc(buf) {
    const u = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str) {
    str = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    const bin = atob(str);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  },
};

const pkSupported = () => typeof window.PublicKeyCredential !== "undefined";

async function pkApi(payload) {
  const res = await fetch("/api/passkeys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function pkErr(target, e) {
  const msg = e && e.name === "NotAllowedError"
    ? "Cancelled or timed out."
    : (e && e.message) || "Something went wrong.";
  target.textContent = msg;
  target.hidden = false;
}

// Show the passkey button on the login dialog only if some are registered.
async function refreshPasskeyButton() {
  let show = false;
  if (pkSupported()) {
    try {
      const res = await fetch("/api/passkeys", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        show = d.supported && d.count > 0;
      }
    } catch (_) {}
  }
  pkEls.loginBtn.hidden = !show;
  pkEls.divider.hidden = !show;
}

async function passkeyLogin() {
  els.loginError.hidden = true;
  try {
    const opt = await pkApi({ action: "auth-options" });
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: b64u.dec(opt.challenge),
        rpId: opt.rpId,
        userVerification: "preferred",
        timeout: 60000,
        allowCredentials: (opt.allowCredentials || []).map((id) => ({
          type: "public-key",
          id: b64u.dec(id),
        })),
      },
    });
    const r = assertion.response;
    await pkApi({
      action: "auth-verify",
      id: b64u.enc(assertion.rawId),
      authenticatorData: b64u.enc(r.authenticatorData),
      clientDataJSON: b64u.enc(r.clientDataJSON),
      signature: b64u.enc(r.signature),
    });
    els.modal.close();
    enterEditMode();
  } catch (e) {
    pkErr(els.loginError, e);
  }
}

async function passkeyRegister() {
  pkEls.error.hidden = true;
  try {
    const opt = await pkApi({ action: "register-options" });
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: b64u.dec(opt.challenge),
        rp: { name: document.title || "Personal site", id: opt.rpId },
        user: {
          id: new TextEncoder().encode("owner"),
          name: "owner",
          displayName: state.name || "Owner",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        attestation: "none",
        timeout: 60000,
        excludeCredentials: (opt.excludeCredentials || []).map((id) => ({
          type: "public-key",
          id: b64u.dec(id),
        })),
      },
    });
    const r = cred.response;
    if (typeof r.getPublicKey !== "function") {
      throw new Error("This browser doesn't expose the passkey public key.");
    }
    const label = prompt("Name this passkey (e.g. iPhone, MacBook):", "My device");
    await pkApi({
      action: "register-verify",
      id: b64u.enc(cred.rawId),
      publicKey: b64u.enc(r.getPublicKey()),
      alg: r.getPublicKeyAlgorithm(),
      clientDataJSON: b64u.enc(r.clientDataJSON),
      label: ((label || "").trim() || "Passkey"),
    });
    await loadPasskeyList();
  } catch (e) {
    pkErr(pkEls.error, e);
  }
}

async function loadPasskeyList() {
  pkEls.list.innerHTML = "";
  let data = { credentials: [] };
  try {
    const res = await fetch("/api/passkeys", { cache: "no-store" });
    data = await res.json();
  } catch (_) {}
  if (!data.credentials || !data.credentials.length) {
    const li = document.createElement("li");
    li.className = "passkey-empty";
    li.textContent = "No passkeys yet. Add one to sign in without a password.";
    pkEls.list.appendChild(li);
    return;
  }
  data.credentials.forEach((c) => {
    const li = document.createElement("li");
    li.className = "passkey-item";
    const span = document.createElement("span");
    const when = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "";
    span.textContent = c.label + (when ? " · " + when : "");
    const del = document.createElement("button");
    del.className = "btn danger small";
    del.textContent = "Remove";
    del.addEventListener("click", async () => {
      if (!confirm("Remove this passkey?")) return;
      try {
        await fetch("/api/passkeys", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.id }),
        });
      } catch (_) {}
      loadPasskeyList();
    });
    li.appendChild(span);
    li.appendChild(del);
    pkEls.list.appendChild(li);
  });
}

function openPasskeyManager() {
  pkEls.error.hidden = true;
  if (!pkSupported()) {
    pkEls.error.textContent = "This browser doesn't support passkeys.";
    pkEls.error.hidden = false;
  }
  loadPasskeyList();
  if (typeof pkEls.modal.showModal === "function") pkEls.modal.showModal();
}

pkEls.loginBtn.addEventListener("click", passkeyLogin);
pkEls.manageBtn.addEventListener("click", openPasskeyManager);
pkEls.add.addEventListener("click", passkeyRegister);
pkEls.close.addEventListener("click", () => pkEls.modal.close());

/* ---------------- Contact form (public) ---------------- */
const contact = {
  form: document.getElementById("contact-form"),
  name: document.getElementById("c-name"),
  email: document.getElementById("c-email"),
  message: document.getElementById("c-message"),
  website: document.getElementById("c-website"),
  status: document.getElementById("contact-status"),
};

function contactStatus(text, cls) {
  contact.status.textContent = text;
  contact.status.className = "form-status" + (cls ? " " + cls : "");
  contact.status.hidden = false;
}

contact.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: contact.name.value.trim(),
    email: contact.email.value.trim(),
    message: contact.message.value.trim(),
    website: contact.website.value, // honeypot
  };
  if (!payload.name || !payload.email || !payload.message) {
    contactStatus("Please add your name, email, and a message.", "err");
    return;
  }
  contactStatus("Sending…", "");
  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      contact.form.reset();
      contactStatus("Thanks — your message was sent! ✓", "ok");
    } else {
      contactStatus(data.error || "Couldn't send right now. Try again later.", "err");
    }
  } catch (_) {
    contactStatus("Network error — please try again later.", "err");
  }
});

/* ---------------- Save contact (vCard) ---------------- */
document.getElementById("vcard-btn").addEventListener("click", () => {
  const parts = (state.name || "").trim().split(/\s+/).filter(Boolean);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + (state.name || "")];
  if (parts.length) {
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    const first = parts[0];
    lines.push(`N:${last};${first};;;`);
  }
  if (state.role) lines.push("TITLE:" + state.role);
  (state.links || []).forEach((l) => {
    const u = sanitizeUrl(l.url);
    if (u.startsWith("mailto:")) lines.push("EMAIL;TYPE=INTERNET:" + u.slice(7));
    else if (u.startsWith("tel:")) lines.push("TEL:" + u.slice(4));
    else if (/^https?:/.test(u)) lines.push("URL:" + u);
  });
  lines.push("END:VCARD");
  const blob = new Blob([lines.join("\r\n")], { type: "text/vcard" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (state.name || "contact").replace(/\s+/g, "_") + ".vcf";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ---------------- Backup & version history ---------------- */
const backup = {
  modal: document.getElementById("backup-modal"),
  list: document.getElementById("history-list"),
  error: document.getElementById("backup-error"),
  importFile: document.getElementById("import-file"),
};

document.getElementById("open-backup").addEventListener("click", () => {
  backup.error.hidden = true;
  loadHistory();
  if (typeof backup.modal.showModal === "function") backup.modal.showModal();
});
document.getElementById("backup-close").addEventListener("click", () => backup.modal.close());

document.getElementById("export-json").addEventListener("click", () => {
  syncTextFromDom();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bio-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("import-json").addEventListener("click", () => backup.importFile.click());
backup.importFile.addEventListener("change", async () => {
  const file = backup.importFile.files && backup.importFile.files[0];
  backup.importFile.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    state = { ...structuredClone(DEFAULT_CONTENT), ...data };
    state.links = Array.isArray(state.links) ? state.links : [];
    render();
    enterEditMode();
    setStatus("Imported — review, then Save to keep", "");
    backup.modal.close();
  } catch (_) {
    backup.error.textContent = "That file isn't valid bio JSON.";
    backup.error.hidden = false;
  }
});

async function loadHistory() {
  backup.list.innerHTML = "";
  let data = { versions: [] };
  try {
    const res = await fetch("/api/history", { cache: "no-store" });
    if (res.ok) data = await res.json();
  } catch (_) {}
  if (!data.versions || !data.versions.length) {
    const li = document.createElement("li");
    li.className = "passkey-empty";
    li.textContent = "No earlier versions yet — they appear here after you save.";
    backup.list.appendChild(li);
    return;
  }
  data.versions.forEach((v) => {
    const li = document.createElement("li");
    li.className = "passkey-item";
    const span = document.createElement("span");
    const when = v.savedAt ? new Date(v.savedAt).toLocaleString() : "";
    span.textContent = (v.name || "Version") + (when ? " · " + when : "");
    const btn = document.createElement("button");
    btn.className = "btn ghost small";
    btn.textContent = "Restore";
    btn.addEventListener("click", async () => {
      if (!confirm("Restore this version? Your current content is saved to history first.")) return;
      try {
        const res = await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: v.index }),
        });
        const d = await res.json();
        if (res.ok && d.content) {
          state = { ...structuredClone(DEFAULT_CONTENT), ...d.content };
          render();
          enterEditMode();
          backup.modal.close();
        }
      } catch (_) {}
    });
    li.appendChild(span);
    li.appendChild(btn);
    backup.list.appendChild(li);
  });
}

/* ---------------- Pointer-reactive specular highlight ---------------- */
els.card.addEventListener("pointermove", (e) => {
  const r = els.card.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  els.glow.style.transform = `translate(${x - r.width * 0.4}px, ${y - r.height * 0.4}px)`;
});

/* ---------------- Boot ---------------- */
els.year.textContent = new Date().getFullYear();
loadContent();

// Edit access is never shown to visitors. The owner opens it via the #edit
// fragment or by triple-tapping the footer copyright.
function maybeOpenEdit() {
  if (/#(edit|login)/i.test(location.hash)) requestEdit();
}
maybeOpenEdit();
window.addEventListener("hashchange", maybeOpenEdit);

(function () {
  const footCopy = document.getElementById("foot-copy");
  let taps = [];
  footCopy.addEventListener("click", () => {
    const now = Date.now();
    taps = taps.filter((t) => now - t < 1500);
    taps.push(now);
    if (taps.length >= 3) {
      taps = [];
      requestEdit();
    }
  });
})();
