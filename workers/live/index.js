// Chat's typing dots, held in memory (functions/_pulse.js asks it, through the site's TYPING binding).
//
// One Typing object per reader for one-to-one chats ("u:<id>": the friends typing to them) and one per group ("g:<id>":
// the members typing in it). Each is a Map of who → until when, 6 seconds after their last word. It never touches its
// storage: when the runtime lets the object go, everything in it goes too, which is the point. It logs nothing about
// who, or what.
//
// The site checks friendship, groups, blocks and everyone's Show When I'm Typing before it asks; this only remembers.

// (not exported: a Worker's named exports must be its entrypoints or functions, and workerd refuses a number)
const TYPING_MS = 6000;

// What one call does to the Map (m: who → until): { set?: id, clear?: id, read?: true } in any combination; expired
// entries go on every call → { typing: [ids] } when read, else { ok: true }; null for a body that isn't one
export function typingMap(m, b, now = Date.now()) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const id = (v) => typeof v === "string" && v.length > 0 && v.length <= 64;
  if ((b.set !== undefined && !id(b.set)) || (b.clear !== undefined && !id(b.clear))) return null;
  for (const [k, until] of m) if (until <= now) m.delete(k);
  if (b.clear !== undefined) m.delete(b.clear);
  if (b.set !== undefined) m.set(b.set, now + TYPING_MS);
  return b.read ? { typing: [...m.keys()] } : { ok: true };
}

const answer = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export class Typing {
  constructor(ctx, env) { this.m = new Map(); }         // (ctx.storage is never used)
  async fetch(request) {
    let b = null;
    try { b = await request.json(); } catch (_) { b = null; }
    const out = typingMap(this.m, b);
    return out ? answer(out) : answer({ ok: false }, 400);
  }
}

// (nothing here is reached from outside: the object only through the binding)
export default { async fetch() { return new Response("Not found.", { status: 404 }); } };
