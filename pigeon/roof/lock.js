// Chats' lock screen and veil (One roof, stage 3, spec §2.1, S3-D14; Chat's lockCheck, drawLock and its
// visibilitychange rule). The app lock is set up on Chat's own page (/chats/in/#account, S3-D8); here it is only kept:
// the core starts locked and stays so until the page says otherwise (lock(false), after the passkey check below).
// This is a privacy veil, not a cipher: the check is a user-verified passkey assertion made and read in this page (the
// UV flag), and its only effect is to let the screen show again. The keys and the plaintext stay in the core either way.
//   LOCK_KEY = "inflight-lock" (Chat's own key, read only here: { on, after, uid })
//   lockPrefs(uid) → { on, after } | null
//   lockCheck() → Promise<true> (rejects when the passkey check fails or isn't user-verified)
//   view(el, ctx) → { show(), hide(), destroy() }: "Chats is locked" + Unlock, in the Chats screen; Unlock → lockCheck,
//     then svc.call("lock", false).
//   watch(ctx, root) → off: while the lock is on, root is veiled while the page is hidden (.ch-veiled), and the core is
//     locked again (svc.call("lock", true)) when it comes back after the lock's time.
export const LOCK_KEY = "inflight-lock";
const T = (f, d) => { try { return f(); } catch (_) { return d; } };

export function lockPrefs(uid) {
  const v = T(() => JSON.parse(globalThis.localStorage?.getItem(LOCK_KEY) || "null"), null);
  return v && v.on && (!uid || v.uid === uid) ? { on: true, after: Number(v.after) || 0 } : null;
}

// (the relying party Chat's passkeys were made for: georgefarrowgreen.com at inflite.ai, as Chat's RP_ID)
const rpId = (host) => (/(^|\.)(georgefarrowgreen\.com|inflite\.ai)$/.test(host) ? "georgefarrowgreen.com" : host);
export async function lockCheck() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const a = await navigator.credentials.get({ publicKey: { challenge, rpId: rpId(globalThis.location?.hostname || ""), userVerification: "required", timeout: 60000 } });
  const ad = a && new Uint8Array(a.response.authenticatorData);
  if (!ad || !(ad[32] & 0x04)) throw new Error("not verified");           // the UV flag: Face ID, Touch ID or the passcode was used
  return true;
}
const how = () => {
  const ua = globalThis.navigator?.userAgent || "";
  return /iPhone|iPad|iPod|Macintosh/.test(ua) ? "Face ID or Touch ID" : /Android/.test(ua) ? "your fingerprint or face" : "your passkey";
};

export function view(el, ctx) {
  const { fw, svc } = ctx, ui = fw.ui;
  let busy = false;
  const btn = ui.btn("Unlock", { primary: true, act: "unlock" });
  const box = ui.el("div", { class: "ch-lock", role: "region", aria: { label: "Chats is locked" }, hidden: true },
    ui.el("h2", { text: "Chats is locked" }), ui.el("p", { text: `Unlock with ${how()}.` }), btn);
  el.append(box);
  const unlock = async () => {
    if (busy) return;
    busy = true; btn.disabled = true;
    try {
      await lockCheck();
      const r = await svc.call("lock", false);
      if (r?.state === "locked") throw new Error("still locked");
    } catch (_) { fw.toast("Couldn’t unlock. Try again."); }
    finally { busy = false; btn.disabled = false; }
  };
  const onClick = (e) => { if (e.target.closest?.("[data-act=unlock]")) unlock(); };
  box.addEventListener("click", onClick);
  return {
    show() { box.hidden = false; },
    hide() { box.hidden = true; },
    destroy() { box.removeEventListener("click", onClick); box.remove(); },
  };
}

export function watch(ctx, root) {
  const { fw, svc, store } = ctx;
  let hiddenAt = 0;
  const offs = [
    fw.on("hidden", () => {
      if (!lockPrefs(store.get("me")?.id)) return;
      hiddenAt = Date.now();
      root.classList.add("ch-veiled");
    }),
    fw.on("visible", () => {
      root.classList.remove("ch-veiled");
      const lp = lockPrefs(store.get("me")?.id);
      if (lp && hiddenAt && Date.now() - hiddenAt >= lp.after && store.get("state")?.state !== "locked") svc.call("lock", true).catch(() => {});
      hiddenAt = 0;
    }),
  ];
  return () => { for (const f of offs) f?.(); root.classList.remove("ch-veiled"); };
}
