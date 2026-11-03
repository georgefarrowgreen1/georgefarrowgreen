// Fitness fixtures for the roof's unit tests (rooffxcore, rooffxviews): two accounts as GET /api/fitness/me answers them,
// their records (profile, Rhythm, swaps, check-ins, workouts, prefs with a key this build doesn't know, and one beside
// them), their activities with figures, plans waiting and Ride At times; and a fake IndexedDB in memory (opened,
// closed, counted), so core.js's idb.js runs under node.
import { startOfDay, addDays, mondayOf } from "../../../../fitness/workouts.js";

export const TODAY = startOfDay(new Date(2026, 9, 21, 12).getTime());   // a Wednesday
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// rides on most days for six weeks, with figures (as the account keeps them: a.sum)
export function rides(prefix, today = TODAY, weeks = 6) {
  const acts = [];
  for (let i = weeks * 7; i > 0; i--) {
    const d = addDays(today, -i), dow = (new Date(d).getDay() + 6) % 7;
    if (dow === 0 || dow === 4) continue;
    const long = dow === 5;
    acts.push({ id: `${prefix}${i}`, start: d + 9 * 3600e3, sport: "ride", name: long ? "Long ride" : "Morning Ride", device: "Garmin Edge 840", type: "fit", file: `r${i}.fit`, gz: true,
      sum: { tss: long ? 110 : 55, moving: long ? 9000 : 3600, secs: long ? 9400 : 3800, dist: long ? 72000 : 30000, asc: 300, np: 210, iF: 0.72, maxHr: 176,
        curve: { 5: 700, 60: 420, 120: 380, 300: 320, 600: 290, 1200: 270, 3600: 240 }, zones: [600, 1200, 900, 400, 200, 100, 0] } });
  }
  return acts.sort((a, b) => b.start - a.start);
}

export function record({ ftp = 250, units = "metric", rhythm = true, today = TODAY } = {}) {
  return {
    profile: { ftp, weight: 72, lthr: 158, maxHr: 176, restHr: 50, runPace: 300, css: 110, set: ["ftp", "weight"], ftpLog: [[addDays(today, -30), ftp - 5, 1]] },
    plan: null,
    rhythm: rhythm ? { days: [0, 60, 75, 60, 0, 180, 90], run: false, swim: false, lean: "balanced", mode: "build", start: mondayOf(addDays(today, -21)), at: addDays(today, -21) } : null,
    swaps: { [addDays(today, 2)]: "recovery-45" },
    feel: { [addDays(today, -1)]: { sleep: 2, legs: 1, mood: 2 } },
    workouts: [{ id: "mine-1", sport: "ride", name: "My sweet spot", kind: "Sweet spot", about: "Two blocks.", steps: [{ kind: "warmup", secs: 600, from: 0.5, to: 0.7 }, { kind: "work", secs: 1200, from: 0.9, to: 0.9 }, { kind: "cooldown", secs: 300, from: 0.6, to: 0.5 }] }],
    prefs: { units, examples: false, maps: "always", future: "kept", nights: "garmin" },
    besideIt: { kept: true },
  };
}

export function me(id, { name = "Ann Rider", ftp = 250, units = "metric", today = TODAY, prefix = "a" } = {}) {
  return {
    signedIn: true, id, name, handle: name.split(" ")[0].toLowerCase(), ver: 7, at: today,
    data: record({ ftp, units, today }),
    acts: rides(prefix, today),
    offers: [{ id: "11111111-2222-3333-4444-555555555555", role: "today", state: "yes", who: "", wid: "recovery-45", sport: "ride", start: addDays(today, 1) + 18 * 3600e3, stop: addDays(today, 1) + 19 * 3600e3, name: "Recovery" }],
    offersToday: true,
    times: [{ day: dayKey(today), start: today + 18 * 3600e3, stop: today + 19.25 * 3600e3, source: "set" }],
    garmin: { on: false }, strava: { on: false }, health: { on: false },
  };
}

// an IndexedDB in memory: indexedDB.open(name) → a db whose store keeps values; closes counted
export function fakeIndexedDB() {
  const dbs = new Map(), log = { opened: [], closed: 0 };
  const req = () => ({ onsuccess: null, onerror: null, onupgradeneeded: null, result: null, error: null });
  const indexedDB = {
    open(name) {
      const r = req();
      log.opened.push(name);
      setTimeout(() => {
        let data = dbs.get(name), fresh = false;
        if (!data) { data = new Map(); dbs.set(name, data); fresh = true; }
        const stores = data;
        const db = {
          createObjectStore: (s) => { if (!stores.has(s)) stores.set(s, new Map()); },
          close: () => { log.closed++; },
          transaction(s, mode) {
            const st = stores.get(s) || new Map(); stores.set(s, st);
            const t = { oncomplete: null, onerror: null, error: null };
            const op = (fn) => { const q = { result: undefined }; setTimeout(() => { q.result = fn(); t.oncomplete?.(); }, 0); return q; };
            t.objectStore = () => ({
              get: (k) => op(() => st.get(k)), put: (v, k) => op(() => { st.set(k, v); return k; }), delete: (k) => op(() => { st.delete(k); }),
              clear: () => op(() => { st.clear(); }), getAllKeys: () => op(() => [...st.keys()]),
            });
            return t;
          },
        };
        r.result = db;
        if (fresh) r.onupgradeneeded?.();
        r.onsuccess?.();
      }, 0);
      return r;
    },
  };
  return { indexedDB, dbs, log };
}

// localStorage in memory
export function memStorage() {
  const mem = new Map();
  return { mem, store: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  } };
}
