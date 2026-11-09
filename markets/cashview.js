import { cashInput, cashNumber, cashTotals, cashId, cashInterest, cashBands, CASH_PAYOUTS, cashPayout, cashNextPayout, cashToday } from "./cash.js";

const rateSaid = (fmt, rate) => `${fmt(rate, 4).replace(/\.?0+$/, "")}%`;
const ratesSaid = ({ fmt, money }, x) => x.tier ? `${rateSaid(fmt, x.rate)} to ${money(x.tier.limit)} · ${rateSaid(fmt, x.tier.rate)} above · AER` : `${rateSaid(fmt, x.rate)} AER`;
const dateSaid = (date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
const payoutSaid = (payout, today = cashToday()) => {
  if (!payout) return "";
  const next = cashNextPayout(payout, today), repeat = CASH_PAYOUTS.find(([key]) => key === payout.repeat)?.[1];
  return `${next === today ? "Payout today" : next ? `Next payout ${dateSaid(next)}` : `Payout date ${dateSaid(payout.date)} · past`} · ${repeat}`;
};

// The same cash rows and editor on Markets' own page, desktop desk and Today module.
// ctx = { h, state, money, fmt, open, save, remove, current, close, toast, accounts }.
export function cashSection(ctx, rows = ctx.state.cash || [], { compact = false } = {}) {
  const { h, money } = ctx, sums = cashTotals(rows), today = cashToday();
  return h("section.cash-section", { "aria-label": "Cash holdings" },
    h("h3.label", {}, "Cash", h("button", { type: "button", onclick: () => ctx.open(), text: "Add cash" })),
    rows.length ? h("div.list.cash-list", {}, rows.map((x) => h("button.item.two.cash-row", { type: "button", "data-cash": x.id, onclick: () => ctx.open(x.id), "aria-label": `Edit ${x.name}: ${money(x.amount)}, ${ratesSaid(ctx, x)}` },
      h("span", {}, h("b", { text: x.name }), h("small", { text: `${ratesSaid(ctx, x)}${x.account ? ` · ${ctx.accounts.find(([k]) => k === x.account)?.[1] || ""}` : ""}` }), x.payout ? h("small.cash-payout-date", { text: payoutSaid(x.payout, today) }) : null),
      h("span.r", {}, h("b.num", { text: money(x.amount) }), h("small", { text: `About ${money(cashInterest(x))}/year` })))))
      : h("div.cash-empty", {}, h("p.hint", { text: "Add a balance and interest rate. Cash counts towards your portfolio." })),
    rows.length && !compact ? h("dl.cash-summary", {},
      h("div", {}, h("dt", { text: "Est. yearly interest" }), h("dd.num", { text: money(sums.annual) })),
      h("div", {}, h("dt", { text: "Monthly equivalent" }), h("dd.num", { text: money(sums.monthly) }))) : null,
    rows.length && !compact ? h("p.hint.cash-note", { text: "AER-based estimates before tax, at your current balance and rates. Bank payouts may differ with compounding and rate or balance changes. Update the balance when it changes." }) : null);
}

export function cashEditor(ctx, id = null) {
  const { h, money, fmt } = ctx, held = id && (ctx.state.cash || []).find((x) => x.id === id);
  const current = ctx.current(), key = held?.id || cashId();
  const name = h("input", { id: "mk-cash-name", type: "text", maxlength: 60, autocomplete: "off", placeholder: "e.g. Savings", value: held?.name || "" });
  const amount = h("input", { id: "mk-cash-amount", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0.00", value: held ? String(held.amount) : "" });
  const rate = h("input", { id: "mk-cash-rate", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0", value: held ? String(held.rate) : "" });
  const limit = h("input", { id: "mk-cash-limit", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "e.g. 5,000", value: held?.tier ? String(held.tier.limit) : "" });
  const above = h("input", { id: "mk-cash-above", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "0", value: held?.tier ? String(held.tier.rate) : "" });
  const payoutDate = h("input", { id: "mk-cash-payout-date", type: "date", min: "1900-01-01", max: "9999-12-31", value: held?.payout?.date || "" });
  const payoutRepeat = h("select", { id: "mk-cash-payout-repeat" }, [["", "Not set"], ...CASH_PAYOUTS].map(([key, label]) => h("option", { value: key, selected: (held?.payout?.repeat || "") === key, text: label })));
  const payoutEnd = h("input", { id: "mk-cash-payout-end", type: "checkbox", checked: !!held?.payout?.monthEnd });
  const inputs = { name, amount, rate, limit, above, payoutDate, payoutRepeat, payoutEnd }, echo = h("p.echo.cash-echo", { "aria-live": "polite" });
  const error = h("p.cash-error", { id: "mk-cash-error", role: "alert", hidden: true });
  const payoutEcho = h("p.echo", { "aria-live": "polite", id: "mk-cash-payout-preview" });
  const payoutEndRow = h("label.cash-check", { for: "mk-cash-payout-end", hidden: !["monthly", "quarterly"].includes(payoutRepeat.value) }, payoutEnd, "Last day of the month");
  const payoutFields = h("div.cash-payout-fields", { hidden: !payoutRepeat.value },
    h("label", { for: "mk-cash-payout-date", text: "Payout date" }), h("div.field", {}, payoutDate), payoutEndRow, payoutEcho,
    h("p.hint", { text: "Recurring dates roll forward on the UK calendar. Dates don’t mark interest as received or change your balance." }));
  let tiered = !!held?.tier;
  const rateLabel = h("label", { for: "mk-cash-rate", text: tiered ? "Rate up to limit (AER)" : "Annual interest rate (AER)" });
  const bandFields = h("div.cash-tier-fields", { hidden: !tiered },
    h("label", { for: "mk-cash-limit", text: "First-tier balance limit" }), h("div.field", {}, h("span.unit", { text: "£" }), limit),
    h("label", { for: "mk-cash-above", text: "Rate above limit (AER)" }), h("div.field", {}, above, h("span.unit", { text: "%" })));
  const mode = h("div.choice.cash-rate-mode", { role: "group", "aria-label": "Interest rate type" }, [[false, "Single rate"], [true, "Tiered rates"]].map(([value, label]) => h("button.press", { type: "button", "data-tiered": String(value), "aria-pressed": String(tiered === value), text: label,
    onclick: () => { tiered = value; bandFields.hidden = !tiered; rateLabel.textContent = tiered ? "Rate up to limit (AER)" : "Annual interest rate (AER)"; mode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tiered === String(tiered)))); error.hidden = true; tell(); } })));
  let account = held?.account || null;
  const choice = h("div.choice", { role: "group", "aria-label": "Held in" }, ctx.accounts.map(([k, label]) => h("button.press", { type: "button", "data-a": k, "aria-pressed": String(account === k), text: label,
    onclick: () => { account = account === k ? null : k; choice.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.a === account))); } })));
  const payoutValue = () => payoutRepeat.value ? { date: payoutDate.value, repeat: payoutRepeat.value, monthEnd: ["monthly", "quarterly"].includes(payoutRepeat.value) && payoutEnd.checked } : null;
  const values = () => ({ id: key, name: name.value, amount: cashNumber(amount.value), rate: cashNumber(rate.value, { rate: true }), tier: tiered ? { limit: cashNumber(limit.value), rate: cashNumber(above.value, { rate: true }) } : null, payout: payoutValue(), account, ...(held?.updated != null ? { updated: held.updated } : {}) });
  const tell = () => {
    try { payoutEcho.textContent = payoutSaid(cashPayout(payoutValue())); } catch (_) { payoutEcho.textContent = ""; }
    let x; try { x = cashInput(values()); } catch (_) { echo.textContent = ""; return; }
    const annual = cashInterest(x);
    echo.replaceChildren(h("span", { text: `About ${money(annual)} a year · ${money(annual / 12)} monthly equivalent` }));
    if (x.tier) echo.append(h("small.cash-band-detail", { text: cashBands(x).filter((b) => b.amount > 0).map((b) => `${money(b.amount)} at ${rateSaid(fmt, b.rate)}`).join(" + ") }));
  };
  for (const input of Object.values(inputs)) input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); error.hidden = true; tell(); });
  const payoutChanged = () => {
    payoutFields.hidden = !payoutRepeat.value;
    payoutEndRow.hidden = !["monthly", "quarterly"].includes(payoutRepeat.value);
    if (!payoutEndRow.hidden && payoutEnd.checked && payoutDate.value) { try { payoutDate.value = cashPayout(payoutValue()).date; } catch (_) {} }
    error.hidden = true; tell();
  };
  for (const input of [payoutDate, payoutRepeat, payoutEnd]) input.addEventListener("change", payoutChanged);
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
      h("label", { text: "Interest rate" }), mode,
      rateLabel, h("div.field", {}, rate, h("span.unit", { text: "%" })), bandFields,
      echo, h("label", { text: "Held in (optional)" }), choice,
      h("label", { for: "mk-cash-payout-repeat", text: "Interest payouts (optional)" }), h("div.field", {}, payoutRepeat), payoutFields),
    h("p.hint", { text: "Use AER, rather than gross p.a., for these estimates. Use 0% for cash that doesn’t earn interest. Rates and balances are updated manually." }),
    error, save, remove);
  return form;
}
