// Optional OS integration. Only the open chat's non-ephemeral media is indexed;
// the core retains ownership of keys, message access and decryption.
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const words = (v) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 140) : "";
const stateOf = (state) => state === "ready" ? "ready" : state === "locked" || state === "key" ? "locked" : state === "signin" || state === "ended" ? "signin" : state == null ? "loading" : "error";

export function mediaFiles(chatId, chat, now = Date.now()) {
  if (!ID.test(chatId || "") || !chat || chat.id !== chatId || !Array.isArray(chat.msgs)) return [];
  const once = new Set(chat.msgs.filter((m) => m?.kind === "viewonce").flatMap((m) => [m.id, m.media?.ref]));
  return chat.msgs.filter((m) => m && ID.test(m.id || "") && ["photo", "voice"].includes(m.kind) && ID.test(m.media?.ref || "") && !m.recalled && !m.expires && !m.flight?.flying && !m.flight?.lost && !once.has(m.media.ref))
    .slice(-200).map((m) => {
      const at = Number.isSafeInteger(m.at) && m.at >= 0 && m.at <= Math.min(now, 864e13) ? m.at : null;
      const type = m.kind === "voice" ? "Voice message" : "Photo", date = at == null ? "" : new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      return { id: `chats:file:${chatId}:${m.id}`, app: "chats", kind: "file", name: `${type}${date ? " · " + date : ""}`, mime: "application/octet-stream", category: m.kind === "voice" ? "audio" : "image", ...(at == null ? {} : { modifiedAt: at }),
        objectId: `${chatId}:${m.id}`, intent: "open-file", downloadIntent: "download-file" };
    });
}

export function connect(root, ctx, { state, chatId, reply, unlock } = {}) {
  const { fw, svc, store, open } = ctx, api = fw.workspace, owner = fw.session.user.id;
  let dead = false;
  const urls = new Set(), timers = new Set();
  const live = () => !dead && !fw.signal.aborted && fw.session.user.id === owner;
  const active = () => live() && api.active() && state() === "ready";
  const source = (id) => words((store.get("groups") || []).find((g) => g.id === id)?.name || (store.get("friends") || []).find((f) => f.id === id)?.name || (store.get("rows") || []).find((r) => r.id === id)?.name) || "Chats";
  function files({ query = "", current = () => true } = {}) {
    if (!live() || !current()) return { status: "error", files: [] };
    const status = stateOf(state()), id = chatId();
    if (status !== "ready") return { status, files: [], message: status === "locked" ? "Unlock Chats to browse available media." : "Open Chats to continue." };
    const q = words(query).toLocaleLowerCase(), items = mediaFiles(id, store.get(`chat:${id}`)).map((file) => ({ ...file, source: source(id) }));
    return { status, files: q ? items.filter((file) => `${file.name} ${file.source}`.toLocaleLowerCase().includes(q)) : items, message: !id ? "Open a chat to browse its available photos and voice messages." : "Only this open chat’s available media is shown." };
  }
  function snapshot() {
    const status = live() ? stateOf(state()) : "signin", ready = status === "ready";
    return { status, files: files().files, actions: [
      { id: "new-chat", label: "New chat", enabled: ready, keywords: ["compose", "message", "write"] },
      { id: "new-group", label: "New group", enabled: ready, keywords: ["people", "conversation"] },
      { id: "requests", label: "Friend requests", enabled: ready, keywords: ["friends"] },
      { id: "settings", label: "Chat settings", enabled: ready },
      ...(ready ? [] : [{ id: "unlock", label: status === "locked" ? "Unlock Chats" : "Open Chats", enabled: true }]),
    ] };
  }
  const currentFile = (object) => {
    if (typeof object !== "string") return null;
    const [cid, mid, extra] = object.split(":");
    return !extra && ID.test(cid || "") && ID.test(mid || "") && cid === chatId() ? files().files.find((file) => file.objectId === object) : null;
  };
  async function run(intent, objectId, { current = () => true } = {}) {
    const permitted = () => live() && current() && api.active();
    if (!permitted()) return { ok: false };
    if (intent === "unlock" && state() === "locked") return { ok: !!(await unlock?.(permitted)) && permitted(), pending: true };
    if (intent === "unlock") { fw.nav.go("/chats/in/#signin-start&then=%2Fchats%2F"); return { ok: true, pending: true }; }
    if (!active()) return { ok: false, error: "Unlock Chats to continue." };
    if (intent === "new-chat") return { ok: !!open.newChat(), pending: true };
    if (intent === "new-group") return { ok: !!open.newGroup(), pending: true };
    if (intent === "requests") return { ok: !!open.requests(), pending: true };
    if (intent === "settings") {
      const m = await fw.lazy((q) => import("./settings.js" + q));
      return permitted() && active() ? { ok: !!m.openChatSettings(ctx), pending: true } : { ok: false };
    }
    if (intent === "reply") {
      if (!ID.test(objectId || "") || ![...(store.get("rows") || []), ...(store.get("friends") || []), ...(store.get("groups") || [])].some((item) => item.id === objectId)) return { ok: false, error: "That conversation is not available here." };
      return { ok: !!reply(objectId), pending: true };
    }
    const file = currentFile(objectId);
    if (!file || !["open-file", "download-file"].includes(intent)) return { ok: false, error: "Open the original chat to use this file." };
    const mid = objectId.split(":")[1];
    if (intent === "open-file") {
      const m = await fw.lazy((q) => import("./sheets.js" + q));
      return permitted() && active() && currentFile(objectId) ? { ok: !!m.openView(ctx, mid), pending: true } : { ok: false };
    }
    const nativeRef = store.get(`chat:${chatId()}`)?.msgs?.find((m) => m.id === mid)?.media?.ref;
    const sameFile = () => currentFile(objectId) && store.get(`chat:${chatId()}`)?.msgs?.find((m) => m.id === mid)?.media?.ref === nativeRef;
    const blob = await svc.call("photo", nativeRef);
    if (!permitted() || !active() || !sameFile()) return { ok: false };
    if (!(blob instanceof Blob)) return { ok: false, error: "This file is no longer available." };
    const ext = ({ "image/jpeg": "jpg", "image/gif": "gif", "audio/mp4": "m4a", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3" })[blob.type] || "bin";
    const downloaded = new File([blob], `${file.category === "audio" ? "voice" : "photo"}-${mid}.${ext}`, { type: blob.type || "application/octet-stream" });
    const media = await fw.lazy((q) => import("./media.js" + q));
    if (!permitted() || !active() || !sameFile()) return { ok: false };
    const url = media.blobUrl(downloaded); urls.add(url);
    const link = fw.ui.el("a", { href: url.url, download: downloaded.name, hidden: true });
    root.append(link); link.click(); link.remove();
    const timer = setTimeout(() => { timers.delete(timer); urls.delete(url); url.revoke(); }, 1000); timers.add(timer);
    return { ok: true, file: downloaded, ref: { ...file, name: downloaded.name, mime: downloaded.type, size: downloaded.size } };
  }
  const off = api.provide({ snapshot, files, run }), changed = () => { if (live()) api.changed(); }, stop = store.on("*", changed);
  function destroy() {
    if (dead) return;
    dead = true; off(); stop();
    for (const timer of timers) clearTimeout(timer); timers.clear();
    for (const url of urls) url.revoke(); urls.clear();
    fw.signal.removeEventListener("abort", destroy);
  }
  fw.signal.addEventListener("abort", destroy, { once: true });
  if (fw.signal.aborted) destroy();
  return { destroy };
}
