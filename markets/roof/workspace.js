// Optional first-party OS tools. Portfolio state, validation and every write
// remain in Markets; these actions only open its existing editors and views.
const bridges = new WeakMap();
const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;

export function connect(ctx, root, current = () => true) {
  const { S, core, fw } = ctx, api = fw.workspace, old = bridges.get(root);
  if (old?.fw === fw) return old;
  old?.destroy();
  const owner = fw.session.user.id;
  let dead = false;
  const live = () => !dead && !fw.signal.aborted && current() && fw.session.user.id === owner && core.fwOf() === fw;
  const owned = () => live() && !!owner && S.me?.id === owner;
  const status = () => owned() ? "ready" : S.loading ? "loading" : S.err ? "error" : "signin";
  const descriptors = [
    ["add-stock", "Add a stock", ["buy", "investment", "holding", "fund"]],
    ["add-cash", "Add cash", ["savings", "interest", "account"]],
    ["income", "Review income", ["dividends", "payments"]],
    ["isa", "Review ISA", ["allowance", "tax"]],
    ["compare", "Compare with the market", ["performance", "benchmark"]],
    ["about", "About these prices", ["data", "prices"]],
    ["refresh", "Refresh Markets", ["retry", "reload"]],
  ];
  const lazy = {
    money: () => fw.lazy((q) => import("./money.js" + q)),
    holdings: () => fw.lazy((q) => import("./holdings.js" + q)),
    stock: () => fw.lazy((q) => import("./stock.js" + q)),
  };
  function snapshot() {
    const ready = owned();
    return { app: "markets", status: status(), error: S.err?.words || null, files: [],
      actions: descriptors.map(([id, label, keywords]) => ({ id, label, keywords, enabled: ready || id === "refresh" && live() })) };
  }
  // Markets currently has no document/export resource. Do not turn account
  // balances into an invented file or a resource silently fetched by the OS.
  function files() { return { status: status(), files: [] }; }
  async function run(intent, objectId, { current: presenting = () => true } = {}) {
    const active = () => live() && presenting() && api.active() !== false;
    if (!active()) return { ok: false };
    if (intent === "refresh") { await core.retry(); return { ok: active() }; }
    if (!owned()) return { ok: false, error: "Open Markets to continue." };
    const open = { "add-stock": "addStock", "add-cash": "cash" }[intent];
    if (open) return { ok: ctx.open[open]() !== null, pending: true };
    const target = { income: ["money", "openIncome"], isa: ["money", "openIsa"], compare: ["money", "openVs"], about: ["holdings", "openAbout"],
      stock: typeof objectId === "string" && SYMBOL.test(objectId) ? ["stock", "openStock"] : null }[intent];
    if (!target) return { ok: false, error: "That action is not available." };
    const module = await lazy[target[0]]();
    if (!active() || !owned()) return { ok: false };
    return { ok: module[target[1]](ctx, objectId) !== null, pending: true };
  }
  const off = api.provide({ snapshot, run, files }), stops = core.EVENTS.map((event) => core.on(event, () => { if (live()) api.changed(); }));
  root.classList.add("mk-workspace");
  function destroy() {
    if (dead) return;
    dead = true; off(); for (const stop of stops) stop();
    root.classList.remove("mk-workspace"); fw.signal.removeEventListener("abort", destroy);
    if (bridges.get(root) === bridge) bridges.delete(root);
  }
  const bridge = { fw, snapshot, run, files, destroy };
  bridges.set(root, bridge); fw.signal.addEventListener("abort", destroy, { once: true });
  if (fw.signal.aborted) destroy();
  return bridge;
}
