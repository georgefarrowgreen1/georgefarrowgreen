import { HttpError } from "./_pigeon.js";
import { mkdb } from "./_markets.js";
import { CASH_ID, MAX_CASH, cashInput } from "../markets/cash.js";

const unpack = (row) => ({ ...row, tier: row.tier ? JSON.parse(row.tier) : null });
export async function cashHoldings(env, userId) {
  const D = await mkdb(env);
  const { results } = await D.prepare("SELECT id, name, amount, rate, tier, account, added, updated FROM mk_cash WHERE user_id = ? ORDER BY added, id").bind(userId).all();
  return results.map(unpack);
}
export async function putCash(env, userId, body) {
  let x;
  try { x = cashInput(body); } catch (e) { throw Object.assign(new HttpError(400, e.message), { field: e.field }); }
  const D = await mkdb(env), now = Date.now(), tier = x.tier ? JSON.stringify(x.tier) : null;
  const same = (row) => row && row.name === x.name && row.amount === x.amount && row.rate === x.rate && row.account === x.account && (row.tier || null) === tier;
  const was = await D.prepare("SELECT name, amount, rate, tier, account, updated FROM mk_cash WHERE user_id = ? AND id = ?").bind(userId, x.id).first();
  // An older open copy of Markets cannot silently remove bands it doesn't understand.
  if (was?.tier && body.tier === undefined) throw new HttpError(409, "This holding uses tiered rates. Update Markets and reopen it before saving.");
  const conflict = () => new HttpError(409, "This cash holding changed on another device. Reopen it before saving.");
  // An identical retry is harmless; a stale edit must not overwrite another device or restore a removed balance.
  if (same(was)) return cashHoldings(env, userId);
  if (was) {
    if (x.updated == null || x.updated !== was.updated) throw conflict();
    const result = await D.prepare(`UPDATE mk_cash SET name = ?, amount = ?, rate = ?, tier = ?, account = ?, updated = ?
      WHERE user_id = ? AND id = ? AND updated = ?`).bind(x.name, x.amount, x.rate, tier, x.account, Math.max(now, was.updated + 1), userId, x.id, x.updated).run();
    if (!result.meta?.changes) throw conflict();
    return cashHoldings(env, userId);
  }
  if (x.updated != null) throw conflict();
  // Stable client IDs make retrying a timed-out create safe. The limit and insert are one statement.
  const r = await D.prepare(`INSERT INTO mk_cash (user_id, id, name, amount, rate, tier, account, added, updated)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8
    WHERE (SELECT COUNT(*) FROM mk_cash WHERE user_id = ?1) < ?9
    ON CONFLICT(user_id, id) DO NOTHING`).bind(userId, x.id, x.name, x.amount, x.rate, tier, x.account, now, MAX_CASH).run();
  if (!r.meta?.changes) {
    const row = await D.prepare("SELECT name, amount, rate, tier, account FROM mk_cash WHERE user_id = ? AND id = ?").bind(userId, x.id).first();
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
