// Chats' store (One roof, stage 3, spec §3.2): the page's copy of what the core last said, one value per topic. The core
// owns the state; its { t: "patch", topic, data } messages come in through apply(), and each view subscribes to the
// topics it draws (on show) and lets go of them (on hide). A null value deletes the topic: the core sends chat:<id> =
// null and typing:<id> = null on leave(), on locked and when it drops plaintext, and clear(prefix) does the same here
// (on locked and on unmount), so the page holds at most the chat on screen.
//   createStore() → { get(topic), on(topic, fn) → off, apply(patch), clear(prefix), topics() }
//     on(topic, fn): fn(data, topic) in a microtask after each change (a run of changes to one topic calls it once,
//       with the last value); topic "*" hears every topic. off() lets go.
//     apply({ topic, data }) (or apply(topic, data)): keeps it, null/undefined deletes it.
//     clear(prefix): every topic starting with prefix deleted (its subscribers told null).
export function createStore() {
  const vals = new Map(), subs = new Map(), due = new Set();
  let queued = false;
  const flush = () => {
    queued = false;
    const ts = [...due];
    due.clear();
    for (const t of ts) {
      const v = vals.has(t) ? vals.get(t) : null;
      for (const fn of [...(subs.get(t) || []), ...(subs.get("*") || [])]) { try { fn(v, t); } catch (e) { console.error(e); } }
    }
  };
  const tell = (t) => { due.add(t); if (!queued) { queued = true; queueMicrotask(flush); } };
  const set = (t, data) => {
    if (typeof t !== "string" || !t) return;
    if (data == null) { if (!vals.has(t)) return; vals.delete(t); } else vals.set(t, data);
    tell(t);
  };
  return {
    get: (t) => (vals.has(t) ? vals.get(t) : null),
    on(t, fn) {
      if (!subs.has(t)) subs.set(t, new Set());
      subs.get(t).add(fn);
      return () => subs.get(t)?.delete(fn);
    },
    apply(p, data) { if (typeof p === "string") set(p, data); else if (p && typeof p === "object") set(p.topic, p.data); },
    clear(prefix = "") { for (const t of [...vals.keys()]) if (t.startsWith(prefix)) set(t, null); },
    topics: () => [...vals.keys()],
  };
}
