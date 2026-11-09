import { cashRows, cashToday } from "./cash.js";
// Cash writes are serial within an account. A late read cannot overwrite a save or a different signed-in account.
export function createCashStore({ state, api, owner, keep, changed }) {
  let queue = Promise.resolve(), queuedFor = null, revision = 0, read = 0, writing = 0;
  let calendar = cashToday();
  const take = (rows) => {
    if (!Array.isArray(rows)) throw new Error("Couldn’t read your cash holdings. Try again.");
    const clean = cashRows(rows);
    if (clean.length !== rows.length) throw new Error("Couldn’t read your cash holdings. Try again.");
    if (JSON.stringify(state.cash || []) === JSON.stringify(clean)) return;
    state.cash = clean; keep(); changed();
  };
  const write = (method, value) => {
    const who = owner(), body = typeof value === "object" ? { ...value } : value;
    if (queuedFor !== who) { queue = Promise.resolve(); queuedFor = who; }
    const next = queue.then(async () => {
      if (!who || owner() !== who) return false;
      revision++; read++; writing++;
      try {
        const answer = await api[method](body);
        if (owner() !== who) return false;
        take(answer.cash);
        return true;
      } catch (e) { if (owner() !== who) return false; throw e; }
      finally { writing--; }
    });
    queue = next.catch(() => {});
    return next;
  };
  return {
    save: (value) => write("putCash", value),
    remove: (id) => write("dropCash", id),
    async sync() {
      const who = owner(), rev = revision, n = ++read;
      if (!who || writing) return false;
      const today = cashToday();
      if (calendar !== today) { calendar = today; if (state.cash?.some((x) => x.payout)) changed(); }
      try {
        const answer = await api.cash();
        if (owner() !== who || rev !== revision || n !== read || writing) return false;
        take(answer.cash);
        return true;
      } catch (_) { return false; } // Keep the last balance when offline; a save still reports its own error.
    },
  };
}
