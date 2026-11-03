// STUB (One roof, stages 2–4, batch j0): the frozen surface of this file (s2/spec.md §4.2, §4.3, §4.7; roof/s24-contracts.md).
// Every export below is final in name and shape; each function throws until its owner ports it. The owner replaces the
// bodies, keeps every export and drops STUB (roofcontract.test skips this file's behaviour cases while STUB is here).
// Owner: FXA. The one file of the module that opens IndexedDB (C5, s24-contracts §9): only REGISTRY.fitness.idb
// ("fitness"), store "files", as fitness/app.js:823 does; the 50-file LRU (keepFile/dropFile/tidyFiles); close() for
// core.stop().
export const STUB = true;
export const NAME = "fitness", STORE = "files";
export function idb() { throw new Error("not yet: idb"); }
export function keepFile() { throw new Error("not yet: keepFile"); }
export function dropFile() { throw new Error("not yet: dropFile"); }
export function tidyFiles() { throw new Error("not yet: tidyFiles"); }
export function close() { throw new Error("not yet: close"); }
