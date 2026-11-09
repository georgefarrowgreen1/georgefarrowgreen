// Manually entered GBP cash. Interest is a forecast, never an automatic balance change or a recorded return.
export const MAX_CASH = 60;
export const CASH_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function cashId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function cashInput(value) {
  const fail = (message, field) => { throw Object.assign(new Error(message), { field }); };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Enter a cash holding.", "amount");
  const { id, amount, rate } = value;
  if (typeof id !== "string" || !CASH_ID.test(id)) fail("That cash holding isn’t valid.", "id");
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1e12 || Math.abs(amount - Math.round(amount * 100) / 100) > 1e-7) fail("Enter an amount from £0 to £1 trillion, with up to two decimal places.", "amount");
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100 || Math.abs(rate - Math.round(rate * 1e4) / 1e4) > 1e-8) fail("Enter an annual interest rate from 0% to 100%, with up to four decimal places.", "rate");
  if (value.name != null && typeof value.name !== "string") fail("Enter a name for this cash holding.", "name");
  const name = (value.name || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || "Cash";
  if (name.length > 60) fail("Keep the name to 60 characters.", "name");
  const account = value.account == null || value.account === "" ? null : value.account;
  if (account != null && !["isa", "sipp", "gia"].includes(account)) fail("Choose an account from the list.", "account");
  if (value.updated !== undefined && (!Number.isSafeInteger(value.updated) || value.updated < 0)) fail("Reopen this cash holding before saving.", "updated");
  return { ...(value.updated !== undefined ? { updated: value.updated } : {}), id: id.toLowerCase(), name, amount: Math.round(amount * 100) / 100, rate, account };
}
export function cashTotals(rows) {
  let amount = 0, annual = 0;
  for (const x of Array.isArray(rows) ? rows : []) {
    if (!x || !Number.isFinite(x.amount) || x.amount < 0 || x.amount > 1e12 || !Number.isFinite(x.rate) || x.rate < 0 || x.rate > 100) continue;
    amount += x.amount;
    annual += x.amount * x.rate / 100;
  }
  return { amount, annual, monthly: annual / 12 };
}
export function cashRows(value) {
  return (Array.isArray(value) ? value : []).flatMap((row) => {
    try { return [{ ...cashInput(row), ...(Number.isFinite(row.added) ? { added: row.added } : {}) }]; }
    catch (_) { return []; }
  });
}
export function cashSeries(amount, range = "1d", now = Math.floor(Date.now() / 1000)) {
  if (!(amount > 0)) return null;
  const days = { "1d": 1, "5d": 7, "1mo": 30, "1y": 365, "5y": 1826 }[range] || 1;
  return { T: [now - days * 86400, now], vals: [amount, amount], base: amount, by: [] };
}
// UK decimal input: commas may group thousands; a blank rate means non-interest-bearing cash.
export function cashNumber(text, { rate = false } = {}) {
  const s = String(text ?? "").trim().replace(rate ? /%\s*$/ : /^£\s*/, "");
  if (!s) return rate ? 0 : NaN;
  return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s) ? Number(s.replace(/,/g, "")) : NaN;
}
