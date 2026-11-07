// The account's real planned route, directly beneath Fitness's workout.
import { icon, sportIcon } from "./ui.js";
import { readRoutePlan, removeRoutePlan } from "./routes-account.js";
async function renderRoutePlan(host, { owner, metric = true, current, onOpen, onBusy, plan: given } = {}) {
  const live = () => host.isConnected && current?.() !== false;
  let plan;
  try {
    plan = given === void 0 ? await readRoutePlan(owner) : given;
  } catch {
    return;
  }
  if (!live()) return;
  const old = host.querySelector('[data-k="route-plan"]');
  if (!plan) {
    old?.remove();
    return;
  }
  const stamp = JSON.stringify([plan.version, plan.route.id, plan.day, plan.time, metric]);
  if (old?.dataset.stamp === stamp) return old;
  old?.remove();
  const e = (t, c, text) => {
    const n = host.ownerDocument.createElement(t);
    n.className = c || "";
    if (text != null) n.textContent = text;
    return n;
  };
  const card = e("section", "card glass fr-plan-summary");
  card.dataset.k = "route-plan";
  card.dataset.stamp = stamp;
  card.setAttribute("aria-label", "Planned cycling route");
  const heading = e("h3", "k", "Your route");
  heading.prepend(icon("ride", 15, 2));
  const row = e("div", "fr-plan-row"), tile = e("span", "tile s-ride"), copy = e("div", "fr-plan-copy");
  tile.append(sportIcon("ride", 20));
  const day = (/* @__PURE__ */ new Date(plan.day + "T12:00:00")).toLocaleDateString(void 0, { weekday: "short", day: "numeric", month: "short" });
  copy.append(e("b", "", plan.route.name), e("p", "", `${day} · ${plan.time} · ${(plan.route.metres / (metric ? 1e3 : 1609.344)).toFixed(1)} ${metric ? "km" : "mi"}`));
  row.append(tile, copy);
  const acts = e("div", "fr-plan-actions"), open = e("button", "pill primary", "View route"), remove = e("button", "pill", "Remove route"), status = e("p", "fr-muted", "Saved to your account.");
  status.setAttribute("role", "status");
  open.type = remove.type = "button";
  open.addEventListener("click", () => {
    if (live()) onOpen?.(plan);
  });
  remove.addEventListener("click", async () => {
    if (!live() || remove.disabled) return;
    remove.disabled = true;
    onBusy?.(true);
    try {
      const remaining = await removeRoutePlan(owner, plan);
      if (live()) {
        if (remaining) renderRoutePlan(host, { owner, metric, current, onOpen, onBusy, plan: remaining });
        else card.remove();
      }
    } catch (e2) {
      if (live()) {
        status.textContent = e2.message;
        remove.disabled = false;
      }
    } finally {
      onBusy?.(false);
    }
  });
  acts.append(open, remove);
  card.append(heading, row, acts, status);
  const workout = host.querySelector('[data-k="daycard"]');
  if (workout) workout.after(card);
  else host.prepend(card);
  return card;
}
export {
  renderRoutePlan
};
