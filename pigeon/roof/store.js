// Chats' page store (§3.2): the last value of each topic the core patched, subscribers called in a microtask; a null
// value deletes the topic; clear(prefix) deletes every topic starting with it (chat:, typing: on locked and unmount).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-A's to write.
// createStore() → { get(topic), on(topic, fn) → off, apply({ topic, data }), clear(prefix) }
//   on(topic, fn): fn(data) after each change of that topic (data null: deleted); topic "*": fn({ topic, data }) for all.
export const STUB = true;

export function createStore() {
  const vals = new Map(), subs = new Map();
  const tell = (topic, data) => queueMicrotask(() => {
    for (const f of [...(subs.get(topic) || [])]) f(data);
    for (const f of [...(subs.get("*") || [])]) f({ topic, data });
  });
  return {
    get: (topic) => (vals.has(topic) ? vals.get(topic) : null),
    on(topic, fn) { const l = subs.get(topic) || new Set(); l.add(fn); subs.set(topic, l); return () => l.delete(fn); },
    apply({ topic, data } = {}) {
      if (typeof topic !== "string") return;
      if (data === null || data === undefined) vals.delete(topic); else vals.set(topic, data);
      tell(topic, data ?? null);
    },
    clear(prefix) { for (const k of [...vals.keys()]) if (k.startsWith(prefix)) { vals.delete(k); tell(k, null); } },
  };
}
