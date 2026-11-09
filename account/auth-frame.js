// The presentation boundary shared by every way into and out of InFlite.
// It owns layout and semantics only. Credentials, keys, sessions and allowed return URLs stay with their callers.
const append = (parent, children) => parent.append(...[children].flat(Infinity).filter(x => x != null && x !== false));
function el(tag, cls, children = [], props = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const [key, value] of Object.entries(props)) if (value != null) node.setAttribute(key, String(value));
  append(node, children);
  return node;
}

export function authScreen({ state, title, description, content, footer, back, destination, identity, mark, extra }) {
  const brand = el("div", "signin-brand", [el("img", "", [], { src: "/inflite.svg?v=1", alt: "", width: 44, height: 44 }), "InFlite"]);
  const intro = el("div", "signin-intro");
  if (destination) intro.append(el("div", "signin-destination", [
    destination.icon && el("img", "", [], { src: destination.icon, alt: "", width: 28, height: 28 }),
    el("span", "", destination.label),
  ]));
  const heading = el("div", "auth-heading", [el("h1", "", title, { id: "auth-title", tabindex: "-1" }),
    description && el("p", "signin-lead", description)]);
  if (identity) intro.append(el("div", "signin-identity", [identity, heading]));
  else { if (mark) intro.append(el("div", "auth-mark", mark, { "aria-hidden": "true" })); intro.append(heading); }
  const panel = el("section", "signin-panel auth-panel welcome glass", [intro, el("div", "auth-content", content),
    footer && el("div", "auth-footer", footer)], { "data-auth-state": state, "aria-labelledby": "auth-title" });
  return el("div", "signin-shell auth-shell", [el("header", "signin-header", [brand, back]),
    el("div", "signin-stage", [panel, extra])]);
}

// A form can complete in place without replacing the frame, losing its destination or replaying the brand.
export function updateAuthScreen(from, { state, title, description, back }) {
  const panel = from.closest(".auth-panel");
  if (!panel) return;
  if (state) panel.dataset.authState = state;
  if (title) panel.querySelector("h1").textContent = title;
  if (back !== undefined) {
    const header = panel.closest(".auth-shell").querySelector(".signin-header");
    header.querySelector(".backapp")?.remove();
    if (back) header.append(back);
  }
  if (description != null) {
    const heading = panel.querySelector(".auth-heading");
    let lead = heading.querySelector(".signin-lead");
    if (!lead) heading.append(lead = el("p", "signin-lead"));
    lead.textContent = description;
  }
}

// Sent by the auth host before JavaScript: the same frame and brand as the ready page, with no account assumption.
export const AUTH_LOADING = `<div class="signin-shell auth-shell" data-auth-loading>
  <header class="signin-header"><div class="signin-brand"><img src="/inflite.svg?v=1" alt="" width="44" height="44">InFlite</div></header>
  <div class="signin-stage"><section class="signin-panel auth-panel glass auth-loading" aria-label="Checking your sign-in">
    <p class="vh" role="status">Checking your sign-in…</p>
    <div class="sk auth-sk-title" aria-hidden="true"></div><div class="sk auth-sk-line" aria-hidden="true"></div>
    <div class="sk auth-sk-field" aria-hidden="true"></div><div class="sk auth-sk-field" aria-hidden="true"></div>
    <div class="sk auth-sk-button" aria-hidden="true"></div>
  </section></div></div>`;
