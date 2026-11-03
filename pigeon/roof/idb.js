// Chats' one IndexedDB file (One roof, stage 3: roof/s3/spec.md S3-D4; s24 C5): REGISTRY.chats.idb = "inflight" v1,
// store "kv", with exactly pigeon/app.js's keys and shapes (session, pins:<uid>, pinsup:, pinsunread:, cache:<uid>,
// drafts:<uid>, outbox:<uid>, notify-asked). Only the core's graph imports it.
// B0's stub (frozen exports), CORE's to write:
//   NAME = "inflight", STORE = "kv"
//   get(key) → Promise<value | null>; set(key, value) → Promise; del(key) → Promise   (never throw; as app.js's idb)
//   locked(key, fn) → Promise<fn's result>   fn run inside navigator.locks.request("inflight:" + key, …) (read-merge-
//     write of outbox:, drafts:, pins*:)
//   gone() → void: forget() was called; every later set/del refused (resolves null, writes nothing); isGone() → boolean
// The stub opens nothing: get answers null, writes do nothing.
export const NAME = "inflight";
export const STORE = "kv";
export const STUB = true;
let dead = false;
export const get = (key) => { void key; return Promise.resolve(null); };
export const set = (key, value) => { void key; void value; return Promise.resolve(null); };
export const del = (key) => { void key; return Promise.resolve(null); };
export const locked = (key, fn) => { void key; return Promise.resolve().then(fn); };
export const gone = () => { dead = true; };
export const isGone = () => dead;
