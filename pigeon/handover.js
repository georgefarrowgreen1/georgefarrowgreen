// InFlight's handover, at its old address (georgefarrowgreen.com/pigeon/).
//
// The first time InFlight starts at chat.inflite.ai on a phone, it
// opens this page there, hidden, and this page hands over what the phone kept
// at the old address: the sign-in (its key sealed as it was, still unreadable),
// unsent pigeons, trusted keys and settings. The two addresses are one site, so
// the browser lets this page see the storage the app here always used; it
// answers only the new address, and only the new address may open it
// (frame-ancestors, functions/pigeon/_middleware.js).
(() => {
  if (window.parent === window) return;
  const TO = `${location.protocol}//chat.${location.host}`;
  const send = (kv) => window.parent.postMessage({ inflight: "handover", kv, ls }, TO);
  const ls = {};
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^inflight-[\w-]+$/.test(k)) ls[k] = localStorage.getItem(k); }
  } catch (_) { /* no settings to bring */ }
  // Once the new address has it all (signed in there), it says so, and what was kept here goes: the key and sign-in a
  // page at this address could otherwise reach, as this address is the home page's too. (Only the new address may say.)
  let db = null;
  addEventListener("message", (e) => {
    if (e.origin !== TO || e.source !== window.parent || e.data?.inflight !== "handover-clear") return;
    try { for (const k of Object.keys(ls)) localStorage.removeItem(k); } catch (_) {}
    try { db?.close(); } catch (_) {}
    const said = () => window.parent.postMessage({ inflight: "handover-cleared" }, TO);
    try { const d = indexedDB.deleteDatabase("inflight"); d.onsuccess = d.onerror = d.onblocked = said; } catch (_) { said(); }
  });
  let r;
  try { r = indexedDB.open("inflight", 1); } catch (_) { return send({}); }
  r.onupgradeneeded = () => r.result.createObjectStore("kv");      // (never used here: nothing to hand over)
  r.onerror = () => send({});
  r.onsuccess = () => {
    db = r.result;
    const kv = {};
    try {
      const tx = r.result.transaction("kv", "readonly"), c = tx.objectStore("kv").openCursor();
      c.onsuccess = () => { const at = c.result; if (at) { kv[at.key] = at.value; at.continue(); } };
      tx.oncomplete = () => send(kv);
      tx.onerror = tx.onabort = () => send({});
    } catch (_) { send({}); }
  };
})();
