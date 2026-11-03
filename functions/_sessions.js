// Every column that ties a row to a sign-in (pg_sessions.hash), in one list (Today First, spec §11.3). When Chat's
// hand-back moves a page's sign-in into Chat's own (functions/api/pigeon/[[path]].js handback), each of these follows
// it, so nothing tied to the old one is orphaned when it's deleted: Today's morning devices, Weather's, Markets' and
// Fitness's notification devices, Chat's own. A unit test (sessioncols.test.mjs) fails if any CREATE TABLE or ALTER
// TABLE in functions/ adds a session or sess column this list lacks.
//   SESSION_COLUMNS: { table: column }
//   repointSession(D, from, to) → prepared UPDATEs, one for each listed table and column that exists now (read with
//     PRAGMA table_info, as functions/_retention.js does, so no other module's setup has to run first), for the
//     caller's own D.batch, so the move and the old sign-in's DELETE are one transaction. It runs nothing itself.
// (B0's first part: SESSION_COLUMNS final, repointSession a stub moving nothing. B0's second part writes it in full;
// the names and arguments stay.)
export const SESSION_COLUMNS = { pg_handback: "session", pg_handoff: "session", pg_push: "session", pg_hops: "session",
  pg_qrsign: "session", td_push: "session", mk_push: "session", fx_push: "session", wx_devs: "sess" };

export async function repointSession(D, from, to) {
  return [];
}
