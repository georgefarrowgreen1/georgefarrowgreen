// Chats' one IndexedDB file (S3-D4, S2 C5). The standalone app uses the same draft locking and merge below.
// The same database Chat itself keeps at its own address and on its page at /chats/in/: "inflight" v1, store "kv",
// with exactly pigeon/app.js's keys and shapes (session, pins:<uid>, pinsup:<uid>, pinsunread:<uid>, cache:<uid>,
// drafts:<uid>, outbox:<uid>, notify-asked). No new key. So a phone that used Chats at the hub opens Chat signed in and
// unlocked, the rollback hands the same data back, and the root worker's tokenHere still reads session.token.
//   get(k) / set(k, v) / del(k): app.js's idb.get/set/del, line for line (a failure answers null, never throws).
//   wipe(k): forget()'s own deletes, the one write allowed after gone().
//   locked(key, fn): fn run inside navigator.locks.request("inflight:" + key) (Web Locks work in Workers), for every
//     read-merge-write of outbox:, drafts: and pins*: (two framework tabs, or a tab and milestone 1's page, risk I9).
//     Without Web Locks, operations in this realm still queue, and draft writes also compare inside IndexedDB.
//   gone(): after forget() (sign-out, user change), every later write is refused (risk I3): set and del answer null
//     and write nothing, so a debounced cacheSave or a slow sync can't put an account back. Reads still answer.
export const NAME = "inflight";
export const STORE = "kv";
export const STUB = false;
let goneAt = 0;
export const isGone = () => goneAt > 0;
export function gone() { goneAt ||= Date.now(); }
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      // (iOS can leave an open hanging after a resume: give up after a few seconds rather than never start)
      const late = setTimeout(() => rej(new Error("This phone’s storage didn’t answer.")), 6000);
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => {
        clearTimeout(late); const db = r.result;
        db.onclose = () => { if (this.db === db) this.db = null; };
        db.onversionchange = () => { try { db.close(); } catch (_) {} if (this.db === db) this.db = null; };
        res((this.db = db));
      };
      r.onerror = () => { clearTimeout(late); rej(r.error); };
    });
  },
  async run(mode, fn, again = true, allowGone = false) {
    const db = await this.open();
    // Opening or reconnecting can outlast forget(). Recheck at the actual transaction boundary.
    if (mode === "readwrite" && goneAt && !allowGone) return null;
    try {
      return await new Promise((res, rej) => {
        const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error("Storage write was cancelled."));
      });
    } catch (e) {
      if (again && e?.name === "InvalidStateError") { this.db = null; return this.run(mode, fn, false, allowGone); }
      throw e;
    }
  },
  get(k) { return this.run("readonly", (s) => s.get(k)).catch(() => null); },
  set(k, v) { if (goneAt) return Promise.resolve(null); return this.run("readwrite", (s) => s.put(v, k)).catch(() => null); },
  del(k) { if (goneAt) return Promise.resolve(null); return this.run("readwrite", (s) => s.delete(k)).catch(() => null); },
  // (forget's own deletes: the one writer allowed after gone(), as it's what makes the account go)
  wipe(k) { return this.run("readwrite", (s) => s.delete(k), true, true).catch(() => null); },
};
const localLocks = new Map();
export function locked(key, fn) {
  const L = globalThis.navigator?.locks;
  if (typeof L?.request === "function") return L.request("inflight:" + key, () => fn());
  const run = (localLocks.get(key) || Promise.resolve()).catch(() => {}).then(fn);
  localLocks.set(key, run);
  return run.finally(() => { if (localLocks.get(key) === run) localLocks.delete(key); });
}
export function draftEntries(value) {
  if (!Array.isArray(value?.d) || value.d.some((entry) => !Array.isArray(entry) || entry.length !== 2 || entry.some(v => typeof v !== "string"))) {
    throw Error("The saved drafts could not be opened.");
  }
  return value.d;
}
// Crypto runs outside the transaction. Read the envelope again and replace it in the same
// readwrite transaction, so a tab without Web Locks still detects any intervening write.
export function swapDraftEnvelope(store, key, before, after, live) {
  const receipt = { result: false }, request = store.get(key);
  request.onsuccess = () => {
    if (!live() || request.result !== before) return;
    if (after === undefined) store.delete(key); else store.put(after, key);
    receipt.result = true;
  };
  return receipt;
}
export const compareDraftEnvelope = (key, before, after, live) => idb.run("readwrite", (store) => swapDraftEnvelope(store, key, before, after, live));

export async function editDrafts(key, { live, read, open, seal, compare }, edit) {
  return locked(key, async () => {
    for (let attempt = 0; live() && attempt < 16; attempt++) {
      const before = await read();
      if (!live() || before === null) return false;
      const drafts = new Map(await open(before));
      if (!live()) return false;
      if (!edit(drafts)) return true;
      const after = drafts.size ? await seal([...drafts]) : undefined;
      if (!live()) return false;
      const saved = await compare(before, after);
      if (saved !== false) return saved === true && live();
    }
    return false;
  });
}
export async function mergeDrafts(key, changes, storage) {
  let pending;
  const saved = await editDrafts(key, storage, (drafts) => {
    pending = new Map(changes);
    for (const [id, { text }] of pending) {
      if (text) drafts.set(id, text); else drafts.delete(id);
    }
    return pending.size > 0;
  });
  if (saved) for (const [id, change] of pending) if (changes.get(id) === change) changes.delete(id);
  return saved;
}
export const get = (k) => idb.get(k);
export const set = (k, v) => idb.set(k, v);
export const del = (k) => idb.del(k);
export const wipe = (k) => idb.wipe(k);
