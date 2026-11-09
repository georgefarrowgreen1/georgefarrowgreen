import { HttpError } from "./_pigeon.js";
import { mkdb } from "./_markets.js";
import { CASH_ID, MAX_CASH, cashInput } from "../markets/cash.js";

export async function cashHoldings(env, userId) {
  const D = await mkdb(env);
  const { results } = await D.prepare("SELECT id, name, amount, rate, account, added, updated FROM mk_cash WHERE user_id = ? ORDER BY added, id").bind(userId).all();
  return results;
}
export async function putCash(env, userId, body) {
  let x;
  try { x = cashInput(body); } catch (e) { throw Object.assign(new HttpError(400, e.message), { field: e.field }); }
  const D = await mkdb(env), now = Date.now();
  const same = (row) => row && row.name === x.name && row.amount === x.amount && row.rate === x.rate && row.account === x.account;
  const was = await D.prepare("SELECT name, amount, rate, account, updated FROM mk_cash WHERE user_id = ? AND id = ?").bind(userId, x.id).first();
  const conflict = () => new HttpError(409, "This cash holding changed on another device. Reopen it before saving.");
  // An identical retry is harmless; a stale edit must not overwrite another device or restore a removed balance.
  if (same(was)) return cashHoldings(env, userId);
  if (was) {
    if (x.updated == null || x.updated !== was.updated) throw conflict();
    const result = await D.prepare(`UPDATE mk_cash SET name = ?, amount = ?, rate = ?, account = ?, updated = ?
      WHERE user_id = ? AND id = ? AND updated = ?`).bind(x.name, x.amount, x.rate, x.account, Math.max(now, was.updated + 1), userId, x.id, x.updated).run();
    if (!result.meta?.changes) throw conflict();
    return cashHoldings(env, userId);
  }
  if (x.updated != null) throw conflict();
  // Stable client IDs make retrying a timed-out create safe. The limit and insert are one statement.
  const r = await D.prepare(`INSERT INTO mk_cash (user_id, id, name, amount, rate, account, added, updated)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7
    WHERE (SELECT COUNT(*) FROM mk_cash WHERE user_id = ?1) < ?8
    ON CONFLICT(user_id, id) DO NOTHING`).bind(userId, x.id, x.name, x.amount, x.rate, x.account, now, MAX_CASH).run();
  if (!r.meta?.changes) {
    const row = await D.prepare("SELECT name, amount, rate, account FROM mk_cash WHERE user_id = ? AND id = ?").bind(userId, x.id).first();
    if (row && !same(row)) throw conflict();
    if (!row) throw new HttpError(400, `You can keep up to ${MAX_CASH} cash holdings.`);
  }
  return cashHoldings(env, userId);
}
export async function dropCash(env, userId, id) {
  if (typeof id !== "string" || !CASH_ID.test(id)) throw new HttpError(400, "That cash holding isn’t valid.");
  const D = await mkdb(env);
  const r = await D.prepare("DELETE FROM mk_cash WHERE user_id = ? AND id = ?").bind(userId, id.toLowerCase()).run();
  if (!r.meta?.changes) throw new HttpError(404, "That cash holding wasn’t found.");
  return cashHoldings(env, userId);
}
