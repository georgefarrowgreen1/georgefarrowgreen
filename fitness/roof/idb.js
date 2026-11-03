// Fitness's one IndexedDB helper under the roof (One roof stage 2, C5): the only module file that opens IndexedDB, and it
// opens only REGISTRY.fitness.idb, "fitness", store "files", as fitness/app.js does (app.js 823-860). Each activity's file
// as this device last fetched it, by account and activity, and the account as last fetched ("me:last"), cleared on
// signing out (core.forgetCopies; You's Sign Out, forgetApps).
//   idb.get(k) / put(k, v) / del(k) / clear() / keys() → Promise      (opened on first use)
//   close()                            the open handle let go (core.stop); every use refused till reopen()
//   reopen()                           uses allowed again (core.start), the database opened on the next one
//   keepFile(k, bytes) / dropFile(k) / tidyFiles()   the 50 files last used (fitness:files), app.js's LRU
export const NAME = "fitness";
export const STORE = "files";
const store = {
  get(k, d) { try { const v = localStorage.getItem("fitness:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("fitness:" + k, JSON.stringify(v)); } catch (_) {} },
};
let p = null, shut = false;
const closed = () => Object.assign(new Error("Fitness’s copies are closed"), { closed: true });
const open = () => {
  if (p) return p;
  const mine = (p = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    // (deleted elsewhere, as You's Sign Out does: the handle let go so that isn't held up)
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); if (p === mine) p = null; }; res(db); };
    r.onerror = () => { if (p === mine) p = null; rej(r.error); };
  }));
  return mine;
};
const run = async (mode, fn) => {
  // (after close(), nothing's read or written, nor the database opened again: a late write from a signed-out
  // account would outlive You's forgetApps)
  if (shut) throw closed();
  const db = await open();
  if (shut) throw closed();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); });
};
export const idb = {
  get: (k) => run("readonly", (s) => s.get(k)), put: (k, v) => run("readwrite", (s) => s.put(v, k)), del: (k) => run("readwrite", (s) => s.delete(k)),
  clear: () => run("readwrite", (s) => s.clear()), keys: () => run("readonly", (s) => s.getAllKeys()),
};
// (the handle let go: an account's copies aren't held open past stop(), nor opened again till the next start())
export function close() { shut = true; const was = p; p = null; was?.then((db) => db.close(), () => {}); }
export function reopen() { shut = false; }
export const opened = () => !!p;

const FILES = 50;
export const filesUsed = () => store.get("files", null) || [];
export function keepFile(k, bytes = null) {
  if (shut) return;
  const list = filesUsed().filter((x) => x !== k).concat(k), gone = list.splice(0, Math.max(0, list.length - FILES));
  store.set("files", list);
  if (bytes) idb.put(k, bytes).catch(() => {});
  for (const x of gone) idb.del(x).catch(() => {});
}
export function dropFile(k) {
  if (shut) return;
  store.set("files", filesUsed().filter((x) => x !== k));
  idb.del(k).catch(() => {});
}
export async function tidyFiles() {
  const keys = (await idb.keys().catch(() => [])).filter((k) => typeof k === "string" && k !== "me:last"), have = new Set(keys), list = filesUsed();
  const all = [...keys.filter((k) => !list.includes(k)), ...list.filter((k) => have.has(k))], gone = all.splice(0, Math.max(0, all.length - FILES));
  store.set("files", all);
  for (const k of gone) idb.del(k).catch(() => {});
}
