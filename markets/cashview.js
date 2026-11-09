import { cashInput, cashNumber, cashTotals, cashId } from "./cash.js";

// The same cash rows and editor on Markets' own page, desktop desk and Today module.
// ctx = { h, state, money, fmt, open, save, remove, current, close, toast, accounts }.
export function cashSection(ctx, rows = ctx.state.cash || [], { compact = false } = {}) {
  const { h, money, fmt } = ctx, sums = cashTotals(rows);
  return h("section.cash-section", { "aria-label": "Cash holdings" },
    h("h3.label", {}, "Cash", h("button", { type: "button", onclick: () => ctx.open(), text: "Add cash" })),
    rows.length ? h("div.list.cash-list", {}, rows.map((x) => h("button.item.two.cash-row", { type: "button", "data-cash": x.id, onclick: () => ctx.open(x.id), "aria-label": `Edit ${x.name}: ${money(x.amount)}, ${fmt(x.rate, 4).replace(/\.?0+$/, "")}% annual interest` },
      h("span", {}, h("b", { text: x.name }), h("small", { text: `${fmt(x.rate, 4).replace(/\.?0+$/, "")}% AER${x.account ? ` · ${ctx.accounts.find(([k]) => k === x.account)?.[1] || ""}` : ""}` })),
      h("span.r", {}, h("b.num", { text: money(x.amount) }), h("small", { text: `About ${money(x.amount * x.rate / 100)}/year` })))))
      : h("div.cash-empty", {}, h("p.hint", { text: "Add a balance and interest rate. Cash counts towards your portfolio." })),
    rows.length && !compact ? h("dl.cash-summary", {},
      h("div", {}, h("dt", { text: "Est. yearly interest" }), h("dd.num", { text: money(sums.annual) })),
      h("div", {}, h("dt", { text: "Monthly equivalent" }), h("dd.num", { text: money(sums.monthly) }))) : null,
    rows.length && !compact ? h("p.hint.cash-note", { text: "Interest is an estimate before tax, assuming the balance and rate stay the same. Update the balance when it changes." }) : null);
}

export function cashEditor(ctx, id = null) {
  const { h, money, fmt } = ctx, held = id && (ctx.state.cash || []).find((x) => x.id === id);
  const current = ctx.current(), key = held?.id || cashId();
  const name = h("input", { id: "mk-cash-name", type: "text", maxlength: 60, autocomplete: "off", placeholder: "e.g. Savings", value: held?.name || "" });
  const amount = h("input", { id: "mk-cash-amount", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0.00", value: held ? String(held.amount) : "" });
  const rate = h("input", { id: "mk-cash-rate", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0", value: held ? String(held.rate) : "" });
  const inputs = { name, amount, rate }, echo = h("p.echo.cash-echo", { "aria-live": "polite" });
  const error = h("p.cash-error", { id: "mk-cash-error", role: "alert", hidden: true });
  let account = held?.account || null;
  const choice = h("div.choice", { role: "group", "aria-label": "Held in" }, ctx.accounts.map(([k, label]) => h("button.press", { type: "button", "data-a": k, "aria-pressed": String(account === k), text: label,
    onclick: () => { account = account === k ? null : k; choice.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.a === account))); } })));
  const values = () => ({ id: key, name: name.value, amount: cashNumber(amount.value), rate: cashNumber(rate.value, { rate: true }), account, ...(held?.updated != null ? { updated: held.updated } : {}) });
  const tell = () => {
    let x; try { x = cashInput(values()); } catch (_) { echo.textContent = ""; return; }
    echo.textContent = `About ${money(x.amount * x.rate / 100)} a year · ${money(x.amount * x.rate / 1200)} monthly equivalent`;
  };
  for (const input of Object.values(inputs)) input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); tell(); });
  tell();
  const report = (e) => {
    error.hidden = false; error.textContent = e.message;
    const input = inputs[e.field];
    if (input) { input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", "mk-cash-error"); input.focus(); }
  };
  const save = h("button.btn.go.press", { type: "button", id: "mk-cash-save", text: held ? "Save cash" : "Add cash" });
  save.onclick = async () => {
    if (save.disabled || !current()) return;
    error.hidden = true;
    let x; try { x = cashInput(values()); } catch (e) { report(e); return; }
    save.disabled = true; if (remove) remove.disabled = true;
    try {
      if (!(await ctx.save(x)) || !current()) return;
      if (save.isConnected) ctx.close();
      ctx.toast(held ? "Cash updated" : "Cash added");
    } catch (e) { if (current() && save.isConnected) report(e); }
    finally { save.disabled = false; if (remove) remove.disabled = false; }
  };
  let armed = false;
  const remove = held && h("button.cash-remove", { type: "button", text: "Remove cash holding" });
  if (remove) remove.onclick = async () => {
    if (remove.disabled || !current()) return;
    if (!armed) { armed = true; remove.textContent = "Tap again to remove"; setTimeout(() => { armed = false; remove.textContent = "Remove cash holding"; }, 4000); return; }
    save.disabled = remove.disabled = true;
    try { if (await ctx.remove(held.id) && current()) { if (remove.isConnected) ctx.close(); ctx.toast("Cash removed"); } }
    catch (e) { if (current() && remove.isConnected) report(e); }
    finally { save.disabled = remove.disabled = false; }
  };
  const form = h("div.cash-editor", {},
    h("div.shead", {}, h("h2", { text: held ? "Edit cash" : "Add cash" })),
    h("div.form", {},
      h("label", { for: "mk-cash-name", text: "Name (optional)" }), h("div.field", {}, name),
      h("label", { for: "mk-cash-amount", text: "Amount" }), h("div.field", {}, h("span.unit", { text: "£" }), amount),
      h("label", { for: "mk-cash-rate", text: "Annual interest rate (AER)" }), h("div.field", {}, rate, h("span.unit", { text: "%" })),
      echo, h("label", { text: "Held in (optional)" }), choice),
    h("p.hint", { text: "Use 0% for cash that doesn’t earn interest. Estimates stay separate from recorded investment returns." }),
    error, save, remove);
  return form;
}
