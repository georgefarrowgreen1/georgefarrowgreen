/* ----------------------------------------------------------------------
   Personal bio page — front-end logic
   - Loads content from /api/content (Cloudflare Pages Function + KV)
   - Falls back to the markup already in the page if the API isn't wired up
   - Password login via /api/login; edits saved via PUT /api/content
---------------------------------------------------------------------- */

const els = {
  name: document.getElementById("f-name"),
  role: document.getElementById("f-role"),
  bio: document.getElementById("f-bio"),
  nameFoot: document.getElementById("f-name-foot"),
  monogram: document.getElementById("monogram"),
  links: document.getElementById("links"),
  year: document.getElementById("year"),
  card: document.getElementById("bio-card"),
  glow: document.querySelector(".card-glow"),
  // login
  openLogin: document.getElementById("open-login"),
  modal: document.getElementById("login-modal"),
  loginForm: document.getElementById("login-form"),
  password: document.getElementById("password"),
  loginError: document.getElementById("login-error"),
  loginCancel: document.getElementById("login-cancel"),
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
  links: [
    { label: "Email", url: "mailto:georgefarrowgreen@icloud.com" },
    { label: "GitHub", url: "https://github.com/georgefarrowgreen1" },
  ],
};

let editing = false;

/* ---------------- Rendering ---------------- */
function monogramFrom(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function render(content) {
  els.name.textContent = content.name || "";
  els.role.textContent = content.role || "";
  els.bio.textContent = content.bio || "";
  els.nameFoot.textContent = content.name || "";
  els.monogram.textContent = monogramFrom(content.name);
  document.title = content.name || "Personal site";
  renderLinks(content.links || []);
}

function renderLinks(links) {
  els.links.innerHTML = "";
  links.forEach((link) => els.links.appendChild(makePill(link)));
}

function makePill(link) {
  const a = document.createElement("a");
  a.className = "pill";
  a.href = sanitizeUrl(link.url);
  if (!a.href.startsWith("mailto:")) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  const label = document.createElement("span");
  label.className = "pill-label";
  label.textContent = link.label || "Link";

  // In edit mode the label & url become editable
  label.addEventListener("click", (e) => {
    if (!editing) return;
    e.preventDefault();
    const newLabel = prompt("Link text:", link.label || "");
    if (newLabel === null) return;
    const newUrl = prompt("Link URL:", link.url || "");
    if (newUrl === null) return;
    link.label = newLabel.trim();
    link.url = newUrl.trim();
    label.textContent = link.label || "Link";
    a.href = sanitizeUrl(link.url);
  });

  a.appendChild(label);

  const remove = document.createElement("button");
  remove.className = "remove-link";
  remove.type = "button";
  remove.textContent = "×";
  remove.title = "Remove link";
  remove.addEventListener("click", (e) => {
    e.preventDefault();
    a.remove();
  });
  a.appendChild(remove);

  // Prevent navigation while editing
  a.addEventListener("click", (e) => {
    if (editing) e.preventDefault();
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
      render({ ...DEFAULT_CONTENT, ...data });
      return;
    }
  } catch (_) {
    /* backend not available — use defaults already in DOM */
  }
  render(DEFAULT_CONTENT);
}

async function checkSession() {
  try {
    const res = await fetch("/api/session", { cache: "no-store" });
    if (res.ok) {
      const { authed } = await res.json();
      if (authed) enterEditMode();
    }
  } catch (_) {}
}

/* ---------------- Edit mode ---------------- */
function enterEditMode() {
  editing = true;
  document.body.classList.add("editing");
  els.toolbar.hidden = false;
  [els.name, els.role, els.bio].forEach((el) => el.setAttribute("contenteditable", "true"));
  setStatus("Editing", "");
}

function exitEditMode() {
  editing = false;
  document.body.classList.remove("editing");
  els.toolbar.hidden = true;
  [els.name, els.role, els.bio].forEach((el) => el.removeAttribute("contenteditable"));
}

function collectContent() {
  const links = [...els.links.querySelectorAll(".pill")].map((a) => ({
    label: a.querySelector(".pill-label").textContent.trim(),
    url: a.getAttribute("href"),
  })).filter((l) => l.label);
  return {
    name: els.name.textContent.trim(),
    role: els.role.textContent.trim(),
    bio: els.bio.textContent.trim(),
    links,
  };
}

function setStatus(text, cls) {
  els.toolbarStatus.textContent = text;
  els.toolbarStatus.className = "toolbar-status" + (cls ? " " + cls : "");
}

async function save() {
  const content = collectContent();
  setStatus("Saving…", "saving");
  try {
    const res = await fetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    if (res.status === 401) {
      setStatus("Session expired", "");
      exitEditMode();
      openLogin();
      return;
    }
    if (!res.ok) throw new Error("save failed");
    render({ ...DEFAULT_CONTENT, ...content }); // refresh monogram, title, etc.
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

/* ---------------- Login ---------------- */
function openLogin() {
  els.loginError.hidden = true;
  els.password.value = "";
  if (typeof els.modal.showModal === "function") els.modal.showModal();
  setTimeout(() => els.password.focus(), 50);
}

els.openLogin.addEventListener("click", () => {
  if (editing) {
    exitEditMode();
  } else {
    openLogin();
  }
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
      data.error || (res.status === 401 ? "Incorrect password." : "Login unavailable.");
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

els.addLink.addEventListener("click", () => {
  const label = prompt("Link text (e.g. LinkedIn):");
  if (!label) return;
  const url = prompt("Link URL:");
  if (url === null) return;
  els.links.appendChild(makePill({ label: label.trim(), url: (url || "").trim() }));
});

els.save.addEventListener("click", save);

/* ---------------- Pointer-reactive specular highlight ---------------- */
els.card.addEventListener("pointermove", (e) => {
  const r = els.card.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  els.glow.style.transform = `translate(${x - r.width * 0.4}px, ${y - r.height * 0.4}px)`;
});

/* ---------------- Boot ---------------- */
els.year.textContent = new Date().getFullYear();
loadContent().then(checkSession);
