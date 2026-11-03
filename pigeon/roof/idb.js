// Chats' one IndexedDB file (S3-D4, S2 C5), for the core Worker only (core.js imports it; nothing in the page does).
// The same database Chat itself keeps at its own address and on its page at /chats/in/: "inflight" v1, store "kv",
// with exactly pigeon/app.js's keys and shapes (session, pins:<uid>, pinsup:<uid>, pinsunread:<uid>, cache:<uid>,
// drafts:<uid>, outbox:<uid>, notify-asked). No new key. So a phone that used Chats at the hub opens Chat signed in and
// unlocked, the rollback hands the same data back, and the root worker's tokenHere still reads session.token.
//   get(k) / set(k, v) / del(k): app.js's idb.get/set/del, line for line (a failure answers null, never throws).
//   wipe(k): forget()'s own deletes, the one write allowed after gone().
//   locked(key, fn): fn run inside navigator.locks.request("inflight:" + key) (Web Locks work in Workers), for every
//     read-merge-write of outbox:, drafts: and pins*: (two framework tabs, or a tab and milestone 1's page, risk I9).
//     No Web Locks (an old WebKit): fn runs as it is, as Chat itself always has.
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
  async run(mode, fn, again = true) {
    const db = await this.open();
    try {
      return await new Promise((res, rej) => {
        const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error("Storage write was cancelled."));
      });
    } catch (e) {
      if (again && e?.name === "InvalidStateError") { this.db = null; return this.run(mode, fn, false); }
      throw e;
    }
  },
  get(k) { return this.run("readonly", (s) => s.get(k)).catch(() => null); },
  set(k, v) { if (goneAt) return Promise.resolve(null); return this.run("readwrite", (s) => s.put(v, k)).catch(() => null); },
  del(k) { if (goneAt) return Promise.resolve(null); return this.run("readwrite", (s) => s.delete(k)).catch(() => null); },
  // (forget's own deletes: the one writer allowed after gone(), as it's what makes the account go)
  wipe(k) { return this.run("readwrite", (s) => s.delete(k)).catch(() => null); },
};
export function locked(key, fn) {
  const L = globalThis.navigator?.locks;
  if (!L || typeof L.request !== "function") return Promise.resolve().then(fn);
  return L.request("inflight:" + key, () => fn());
}
export const get = (k) => idb.get(k);
export const set = (k, v) => idb.set(k, v);
export const del = (k) => idb.del(k);
export const wipe = (k) => idb.wipe(k);
