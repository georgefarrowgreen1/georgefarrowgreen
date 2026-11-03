// Every column that ties a row to a sign-in (pg_sessions.hash), in one list (Today First, spec §11.3). When Chat's
// hand-back moves a page's sign-in into Chat's own (functions/api/pigeon/[[path]].js handback), each of these follows
// it, so nothing tied to the old one is orphaned when it's deleted: Today's morning devices, Weather's, Markets' and
// Fitness's notification devices, Chat's own. A unit test (sessioncols.test.mjs) fails if any CREATE TABLE or ALTER
// TABLE in functions/ adds a session or sess column this list lacks.
//   SESSION_COLUMNS: { table: column }
//   repointSession(D, from, to) → prepared UPDATEs, one for each listed table and column that exists now (read with
//     PRAGMA table_info, as functions/_retention.js does, so no other module's setup has to run first), for the
//     caller's own D.batch, so the move and the old sign-in's DELETE are one transaction. It runs nothing itself.
//   (a table not made yet, or made before its column was added, has no rows to move, so it's left out; with no old
//   sign-in, or the same one, there's nothing to move: [])
export const SESSION_COLUMNS = { pg_handback: "session", pg_handoff: "session", pg_push: "session", pg_hops: "session",
  pg_qrsign: "session", td_push: "session", mk_push: "session", fx_push: "session", wx_devs: "sess" };

export async function repointSession(D, from, to) {
  if (typeof from !== "string" || !from || typeof to !== "string" || !to || from === to) return [];
  const tables = Object.keys(SESSION_COLUMNS);
  // (one trip: each table's columns, none for a table that isn't there)
  const cols = await D.batch(tables.map((t) => D.prepare(`PRAGMA table_info("${t}")`)));
  return tables.filter((t, i) => (cols[i]?.results || []).some((c) => c.name === SESSION_COLUMNS[t]))
    .map((t) => D.prepare(`UPDATE ${t} SET ${SESSION_COLUMNS[t]} = ? WHERE ${SESSION_COLUMNS[t]} = ?`).bind(to, from));
}
