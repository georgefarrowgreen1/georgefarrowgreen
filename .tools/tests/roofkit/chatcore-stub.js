// The kit's stub core (One roof, stage 3: roof/s3/spec.md §5.4, §5.5; B0, then HOST's): a module Worker that answers
// every RPC of pigeon/roof/core.js's table from the fixtures (unit/fixtures/chats.mjs, served at /kit/fixtures/chats.mjs),
// served by roofkit/serve.mjs in place of /chats/roof/core.js when the kit page is opened with ?service=stub (the
// cookie kit-service=stub). ?state=ready|signin|key|locked|device|offline|ended (the cookie kit-chat-state; default
// ready) is the state it starts in; serve.mjs writes it in for __KIT_STATE__. What UI-A, UI-B, HOST and Q build against:
// the same wire, the same shapes, the same why words as the real core; nothing kept, nothing fetched.
//   Reading methods answer only while ready (offline: from the fixtures too); otherwise { ok: false, why: <the state> }.
//   rows' lines only through rows(from, to), and only while ready; chat:<id> only after open(id), null on leave() and
//   lock(true). sendRun patches send sealing then sent. self.kitCalls (in the Worker) counts calls by method.
import { world, ONE, IDS } from "/kit/fixtures/chats.mjs";

const PROTOCOL = 1;
const START = "__KIT_STATE__";
const W = world(/^(ready|signin|key|locked|device|offline|ended)$/.test(START) ? START : "ready");
let state = W.state, base = state === "locked" ? "ready" : state, opened = null, n = 0;
const calls = (self.kitCalls = {});
const patch = (topic, data) => self.postMessage({ t: "patch", topic, data });
const noLines = (rows) => rows.map(({ line, ...r }) => r);
const reading = () => state === "ready" || state === "offline";
const all = () => {
  patch("state", { state });
  if (state === "signin" || state === "key" || state === "device" || state === "ended") return;
  patch("me", W.me); patch("rows", noLines(W.rows)); patch("friends", W.friends); patch("groups", W.groups);
  patch("requests", W.requests); patch("air", W.air); patch("outbox", W.outbox); patch("keywarn", W.keywarn); patch("unread", W.unread);
};
const drop = () => { if (opened) { patch(`chat:${opened}`, null); patch(`typing:${opened}`, null); opened = null; } };
const chatOf = (id) => W.chats[id] || ({ ...ONE.Chat, id, msgs: [] });
const blob = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
class No extends Error { constructor(why) { super(why); this.why = why; } }
const need = () => { if (!reading()) throw new No(state === "ready" ? "no" : state); };

const M = {
  hello: () => ({ protocol: PROTOCOL }),
  start: (o = {}) => { if (state === "ready" && o.locked === true) state = "locked"; if (state === "locked" && o.locked === false) state = base; all(); return { state }; },
  state: () => ({ state }),
  lock: (on) => { if (on && reading()) { state = "locked"; drop(); patch("rows", noLines(W.rows)); } else if (!on && state === "locked") state = base; patch("state", { state }); return { state }; },
  signOut: () => { drop(); state = base = "signin"; patch("state", { state }); return { ok: true }; },
  forget: () => { drop(); state = base = "signin"; patch("state", { state }); return { ok: true }; },
  sync: () => { need(); all(); return { ok: true }; },
  open: (id) => { need(); if (!W.chats[id]) throw new No("no"); if (opened && opened !== id) drop(); opened = id; const c = chatOf(id); patch(`chat:${id}`, c); if (W.typing[id]) patch(`typing:${id}`, W.typing[id]); return c; },
  leave: () => { drop(); return { ok: true }; },
  older: () => { need(); return { ...ONE.Older }; },
  rows: (from = 0, to = 40) => { need(); return W.rows.slice(from, Math.min(to, from + 40)); },
  search: (q = "") => {
    need();
    const s = String(q).trim().toLowerCase(); if (!s) return [];
    const hits = [];
    for (const c of Object.values(W.chats)) for (const m of c.msgs) if (m.text && m.text.toLowerCase().includes(s)) hits.push({ token: `tk-${m.id}`, chatId: c.id, title: W.rows.find((r) => r.id === c.id)?.name.split(" ")[0] || "Chat", sub: m.text.slice(0, 90), at: m.at });
    return hits.sort((a, b) => b.at - a.at).slice(0, 8);
  },
  waiting: () => (state === "ready" ? [{ ...ONE.Waiting }] : []),
  since: () => (state === "ready" ? { ...ONE.Since } : null),
  photo: () => { need(); return blob(); },
  sendText: (id, text) => {
    need();
    const m = { id: `m-kit-${++n}`, from: "me", at: Date.now(), kind: "text", text: String(text), reactions: {}, read: false, delivered: false, recalled: false };
    const c = W.chats[id]; if (c) { c.msgs.push(m); if (opened === id) patch(`chat:${id}`, c); }
    return { id: m.id };
  },
  sendBlob: () => { need(); return { id: `m-kit-${++n}` }; },
  note: () => { need(); return { ok: true }; }, react: () => { need(); return { ok: true }; }, recall: () => { need(); return { ok: true }; },
  read: () => { need(); return { ok: true }; }, draft: () => ({ ok: true }),
  share: () => { need(); return W.rows.map((r) => ({ ...r, line: undefined, can: !r.keyChanged })); },
  rank: () => { need(); return { [IDS.pat]: { why: "Rain where they are", score: 2 } }; },
  sendRun: (spec = {}) => {
    need();
    const id = `s-kit-${++n}`;
    patch("send", { id, step: "sealing" });
    const pick = Array.isArray(spec.pick) ? spec.pick : [];
    const bad = pick.filter((p) => W.friends.find((f) => f.id === p)?.keyChanged);
    if (bad.length) { patch("send", { id, step: "failed", why: "trust" }); return { ok: false, why: "trust", sent: [], failed: bad }; }
    patch("send", { id, step: "sent" });
    return { ok: true, say: "Sent", sent: pick, failed: [] };
  },
  safety: () => { need(); return { ...ONE.Safety }; }, verify: () => { need(); return { ok: true }; }, trust: () => { need(); return { ok: true }; },
  meta: (name) => {
    need();
    if (name === "avatar" || name === "gif") return blob();
    if (name === "me") return { me: W.me };
    if (["friends", "friends-respond", "friend-status", "block", "mutuals", "groups", "group-add", "group-name", "group-leave", "group-mute", "flight-log", "loft", "feathers",
      "feathers-buy", "bird-wear", "bird-retire", "skies", "wind-grid", "route-plan", "wx-plan", "way", "wave", "news", "gif-search", "time-offer", "together", "fit-offer",
      "fit-share", "card-now", "my-card", "share-rank"].includes(name)) return {};
    throw new No("no");
  },
};

self.addEventListener("message", async (e) => {
  const d = e.data;
  if (!d || typeof d !== "object" || !Number.isInteger(d.id)) return;
  calls[d.m] = (calls[d.m] || 0) + 1;
  const f = Object.hasOwn(M, d.m) ? M[d.m] : null;
  if (!f || !Array.isArray(d.a ?? [])) return self.postMessage({ id: d.id, ok: false, why: "no" });
  try { self.postMessage({ id: d.id, ok: true, v: await f(...(d.a || [])) }); }
  catch (err) { self.postMessage({ id: d.id, ok: false, why: err?.why || "failed" }); }
});
