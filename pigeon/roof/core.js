// Chats' crypto core (One roof, stage 3: roof/s3/spec.md S3-D3–D5, §5.4, §5.5): a module Worker, made only by
// service.js (`new Worker(new URL("./core.js", import.meta.url), { type: "module", name: "chats-core" })`), holding
// Chat's session token, the private key as the non-extractable CryptoKey read from IndexedDB, pins and the pins gate,
// pairs, messages, the plaintext store, the ciphertext cache, the outbox and drafts. It makes every /api/pigeon/* call.
//
// ==== THE HEADER (frozen by B0; CORE's body may only add comments here) ====
//
// HONEST LIMIT. This Worker keeps the keys and the plaintext store out of the shared page's heap and DOM; the text of
// the chat on screen is in the page's DOM while you read it. It does not stop hostile code of the same origin (such
// code could open IndexedDB itself): every script on the page is the site's own, and roofcontract's greps keep the
// page's module files off indexedDB, IFL, serviceWorker and document-wide lookups (S1 §5.1, S3-C2).
//
// WHAT NEVER CROSSES. To the page: never the token, a key or JWK, a pin, a ciphertext body (ct/iv), or the plaintext of
// any chat but the one the page open()ed (rows' last lines only for the rows asked for by rows(from, to)). To the core:
// never a password, PRF output or JWK; no Argon2, no unlock, no passkey, no vault here (S3-D8: Chat's own page at
// /chats/in/ does all of that). Object URLs are made only in the page (media.js), never here. No result of any method
// has a key named d, kty, token, ct or iv (roofchatcore's RPC-table test).
//
// THE WIRE (postMessage, structured clone):
//   page → core   { id: number, m: <a method of RPC>, a: [arguments, as each method's `args` below] }
//   core → page   { id, ok: true, v: <result> }  |  { id, ok: false, why: <one of WHY> }
//                 { t: "patch", topic: <one of TOPICS, or "chat:<id>" / "typing:<id>">, data: <shape below> | null }
//   A method that isn't in RPC, or arguments that don't keep its rules, → { id, ok: false, why: "no" }. Nothing else is
//   ever answered. data null deletes the topic (store.js), and the core sends it for chat:<id> and typing:<id> on
//   leave(), on locked, and when it drops plaintext after 10 minutes hidden.
//   The first call is always hello(PROTOCOL): the core answers { ok: true, v: { protocol: <its own> } } either way, and
//   a service whose PROTOCOL differs from it calls its onStale (S1 D21's boundary reload) and makes no other call.
//
// ARGUMENT RULES (ARG below; each method's args is a list, positional; "?" = may be left out or undefined):
//   "id"     a string /^[\w-]{1,64}$/ (a friend's, group's, message's or outbox item's id: UUIDs and local ids)
//   "ids"    an array of at most 50 "id"s
//   "text"   a string of at most 4000 characters (what you typed, to seal)
//   "q"      a string of at most 100 characters (a search, on this phone only)
//   "emoji"  a string of at most 16 characters
//   "int"    an integer ≥ 0; "num" a finite number; "bool" true or false; "t" a time in ms (a finite number ≥ 0)
//   "blob"   a Blob of at most 25 MB (a photo or a voice pigeon, recorded or picked in the page)
//   "card"   a plain object (checked inside by cards.js normCard, from: "hash", as engineCard checks a #share= card)
//   "words"  a string of at most 500 characters (a card's words)
//   "name"   one of META's names
//   "obj"    a plain object (its keys checked by the method: META's `keys` for meta(); the listed keys elsewhere)
//   { k: rule, … }   a plain object with only these keys, each keeping its rule
//
// STATES (patch "state", and state()): ready | signin | key | locked | device | offline | ended
//   ready   signed in, unlocked, keys here          signin  no Chat session on this phone
//   key     signed in to InFlite but no key in this origin's IDB (Unlock Chats on this phone, S3-D8)
//   locked  the app lock is on (the core starts locked and stays so until start({ locked: false }) or lock(false))
//   device  a computer (the core never starts there; the service answers this itself)
//   offline no signal and nothing cached to show    ended  a 401 mid-session (signed out of Chats)
//
// WHY words (a refusal's why; the facade's { ok: false, why } too):
//   signin | key | locked | device | offline | ended  the state that stopped it
//   tap     sendTo without the page's tap               card   no card that passes normCard
//   trust   a friend's key changed or not trusted        failed the server refused it
//   no      not a method, bad arguments, not in META, or gone (forget() was called)
//
// RPC (the frozen allow-list; `args` as ARGUMENT RULES; `v` the result's shape; `patches` the topics it may emit):
//   Life
//     hello(protocol: "int")                        → { protocol }                                  —
//     start({ visible?, locked?, screen?, lockUid? })  → { state }                                     state me rows friends groups requests air outbox keywarn unread
//         visible: the page is visible (sync, not sync?quiet=1, only when also screen); locked: the app lock's state
//         read from localStorage["inflight-lock"] by the service before this first call (default true: locked);
//         screen: the Chats screen has been shown (cache: is written only after a start with screen: true, S3-D4);
//         lockUid ("id"): the account the kept lock is for (inflight-lock's uid): the lock holds only for that account
//     state()                                       → { state }                                     —
//     lock(on: "bool")                              → { state }                                     state (locked: chat:* typing:* null, rows lines blanked)
//     signOut()                                     → { ok: true }  (logout on the server, then forget())   state
//     forget()                                      → { ok: true }  (this phone's Chat data dropped; every later write refused: gone)   state
//   Reading
//     sync({ quiet? }: { quiet: "bool" })           → { ok: boolean }   (quiet: sync?quiet=1, never "seen in Chats")   rows friends groups requests air outbox keywarn unread chat:<id> typing:<id>
//     open(id: "id")                                → Chat (the chat:<id> topic's value; also patched)   chat:<id> typing:<id> unread rows
//     leave()                                       → { ok: true }   (the pulse stops, the open chat unmarked, its topics null)   chat:<id> typing:<id>
//     older(id: "id", before: "t")                  → { added: int, older: boolean }                 chat:<id>
//     rows(from: "int", to: "int")                  → Row[] (with line for these rows only; to - from ≤ 40)   —
//     search(q: "q")                                → SearchHit[] (newest 8; over chats already on this phone)   —
//     waiting({ ids?: "ids", stocks?: [{ sym?, name? }] ≤ 50 })   → Waiting[] (digest.js waitingDigest's rows; quiet=1, nothing marked read, nothing kept)   —
//     since(id: "id", t: "t")                       → { said, at } | null   (as engineSince)          —
//     photo(msgId: "id")                            → Blob | null   (a photo or a voice pigeon, decrypted)   —
//   Sending (sealed here; trustedPub/keysOf gate every one)
//     sendText(id: "id", text: "text", { way?, kind?, replyTo?, at? }: { way: "str:20", kind: "str:20", replyTo: "id", at: "t" })   → { id }   outbox chat:<id> rows
//     sendBlob(id: "id", blob: "blob", kind: "photo" | "voice")   → { id }                          outbox chat:<id> rows
//     note(id: "id", msgId: "id", text: "text")     → { ok: true }   (a stopover note)              chat:<id>
//     react(id: "id", msgId: "id", emoji: "emoji")  → { ok: true }                                  chat:<id>
//     recall(id: "id", msgId: "id")                 → { ok: true }                                  chat:<id> rows
//     read(id: "id")                                → { ok: true }   (only for the open chat, shown and visible)   rows unread
//     draft(id: "id", text: "text")                 → { ok: true }   (drafts:<uid>, under the lock)  —
//     share(card: "card", words: "words")           → Row[] ranked for this card (sendRows; can: boolean per row)   —
//     rank(card: "card")                            → { [id]: { why: string, score: num } }   (../rank.js, imported on first use)   —
//     sendRun(spec: { card: "card", words: "words", pick: "ids", when?: "str:20", ask?: "bool", plan?: "bool", note?: "text" })   → SendResult   send outbox rows
//   Trust (public keys only)
//     safety(id: "id")                              → { digits: string, verified: boolean, keyChanged: boolean }   —
//     verify(id: "id", on: "bool")                  → { ok: true }                                  friends keywarn
//     trust(id: "id")                               → { ok: true }   (trustNewKey: a changed key accepted)   friends keywarn rows
//   Metadata (no message words; META below)
//     meta(name: "name", args: "obj")               → the endpoint's JSON (a Blob for META's blob entries)   me friends groups requests (as the endpoint changes them)
//
// META (meta(name, args): the endpoints that carry no message words, from pigeon/app.js's own api( call sites; each
// with its method(s), the path it builds, and the argument keys allowed: q = in the query string, b = in the JSON body.
// Not META, ever: messages, group-messages, read, group-read, react, stopover-note, pins, salt, resume, reauth,
// sessions, sessions-end, logout, vault, passkey*, handback, push-*, account-link, confirm-*: their bodies hold
// ct/iv/text, pins, vault, passkey, salt, resume, reauth, sessions or logout, or they are Chat's own page's.)
//
// TYPES (JSDoc; one of each in .tools/tests/unit/fixtures/chats.mjs; roofchatservice checks the real core against them)
/**
 * @typedef {"ready"|"signin"|"key"|"locked"|"device"|"offline"|"ended"} State
 * @typedef {{ id: string, kind: "friend"|"group", name: string, avatar: string|null, unread: number, flying: number,
 *   pinned: boolean, at: number, keyChanged: boolean, line?: string }} Row
 *   (avatar: a META avatar's key ("<id>:<avatarAt>") or null: the page asks meta("avatar", …) for the Blob; line only
 *   for rows in the window rows(from, to) asked for)
 * @typedef {{ id: string, handle: string, name: string, avatar: string|null, online: boolean, lastSeen: number|null,
 *   place?: string, keyChanged: boolean, verified: boolean, blocked: boolean }} Friend
 *   (place only where the friend shares it and the list shows it today)
 * @typedef {{ id: string, name: string, members: { id: string, name: string }[], muted: boolean }} Group
 * @typedef {{ id: string, handle: string, name: string, at: number, dir: "in"|"out" }} Request
 * @typedef {{ id: string, name: string, handle: string, avatar: string|null, pigeons: boolean, startAs: "instant"|"pigeon",
 *   death: boolean, place?: string, feathers: number }} Me
 * @typedef {{ id: string, chatId: string, kind: string, from: string, to: string, landsAt: number }} Air
 *   (no words; from/to: first names, or "me"; no place names beyond what the list shows today)
 * @typedef {{ flying: boolean, landsAt: number|null, lost: boolean, waiting: boolean, way: string|null, pigeon: string|null }} Flight
 * @typedef {{ id: string, from: string, at: number,
 *   kind: "text"|"photo"|"voice"|"card"|"ask"|"plan"|"answer"|"when"|"viewonce"|"system",
 *   text?: string, flight?: Flight, replyTo?: string, reactions: { [emoji: string]: number }, mine?: string,
 *   read: boolean, delivered: boolean, recalled: boolean, expires?: number, card?: object,
 *   media?: { ref: string, kind: "photo"|"voice", secs?: number }, postmark?: string }} Msg
 *   (from: "me" | "them" | a group member's id; mine: the reaction you gave, if any; card: cards.js normCard's shape;
 *   media.ref: a token for photo(ref), never a URL)
 * @typedef {{ id: string, kind: "friend"|"group", msgs: Msg[], older: boolean }} Chat           (topic chat:<id>)
 * @typedef {{ on: boolean }} Typing                                                              (topic typing:<id>)
 * @typedef {{ id: string, chatId: string, state: "queued"|"sending"|"failed" }} OutItem         (topic outbox: OutItem[]; no text)
 * @typedef {{ mine: boolean, friends: string[] }} KeyWarn                                        (topic keywarn)
 * @typedef {{ id: string, step: "sealing"|"sent"|"failed", why?: string }} SendStep              (topic send)
 * @typedef {{ token: string, chatId: string, title: string, sub: string, at: number }} SearchHit
 *   (token: the message, kept in the Worker; open(chatId) then older() finds it; never in a URL)
 * @typedef {{ id: string, first: string, at: number, said: string, kind: "invite"|"ask"|"question"|"message",
 *   topics: object[] }} Waiting                                                                  (digest.js waitingDigest's row)
 * @typedef {{ ok: boolean, say?: string, sent: string[], failed: string[], why?: string }} SendResult
 */
// Topics and their data: state → { state: State }, me → Me, rows → Row[], friends → Friend[], groups → Group[],
// requests → Request[], air → Air[], chat:<id> → Chat, typing:<id> → Typing, outbox → OutItem[], send → SendStep,
// keywarn → KeyWarn, unread → number.
//
// IMPORTS. Static: ./idb.js ../crypto.js ../cards.js ../digest.js ../links.js (the core graph, connector.files);
// dynamic: only import("../rank.js") (Send's ranking, on first rank/share/sendRun). roofcontract's Worker grep set
// (S3-C2): no document, window, localStorage, fw, location writes, serviceWorker, unlock(/vaultWith/argon2 here.
//
// ==== end of the header ====
import { get, set, del, locked as underLock } from "./idb.js";
import { E2E } from "../crypto.js";
import { normCard } from "../cards.js";
import { waitingDigest } from "../digest.js";
import { linkParts } from "../links.js";

const fz = (o) => Object.freeze(o);
export const PROTOCOL = 1;
export const STATES = fz(["ready", "signin", "key", "locked", "device", "offline", "ended"]);
export const WHY = fz(["signin", "key", "locked", "device", "offline", "ended", "tap", "card", "trust", "failed", "no"]);
// (the topics; "chat:" and "typing:" are prefixes, followed by a chat's id)
export const TOPICS = fz(["state", "me", "rows", "friends", "groups", "requests", "air", "chat:", "typing:", "outbox", "send", "keywarn", "unread"]);

// The RPC table as data (the header's, exactly): args (the argument rules, positional), v (the result's shape, a name
// of TYPES or a literal), patches (the topics it may emit). service.js, the stub core and the tests read it.
const B = "bool?", O = (o) => fz(o);
export const RPC = fz({
  hello: O({ args: fz(["int"]), v: "{ protocol }", patches: fz([]) }),
  start: O({ args: fz([O({ visible: B, locked: B, screen: B, lockUid: "id?" })]), v: "{ state }", patches: fz(["state", "me", "rows", "friends", "groups", "requests", "air", "outbox", "keywarn", "unread"]) }),
  state: O({ args: fz([]), v: "{ state }", patches: fz([]) }),
  lock: O({ args: fz(["bool"]), v: "{ state }", patches: fz(["state", "chat:", "typing:", "rows"]) }),
  signOut: O({ args: fz([]), v: "{ ok }", patches: fz(["state"]) }),
  forget: O({ args: fz([]), v: "{ ok }", patches: fz(["state"]) }),
  sync: O({ args: fz([O({ quiet: B })]), v: "{ ok }", patches: fz(["rows", "friends", "groups", "requests", "air", "outbox", "keywarn", "unread", "chat:", "typing:"]) }),
  open: O({ args: fz(["id"]), v: "Chat", patches: fz(["chat:", "typing:", "unread", "rows"]) }),
  leave: O({ args: fz([]), v: "{ ok }", patches: fz(["chat:", "typing:"]) }),
  older: O({ args: fz(["id", "t"]), v: "{ added, older }", patches: fz(["chat:"]) }),
  rows: O({ args: fz(["int", "int"]), v: "Row[]", patches: fz([]) }),
  search: O({ args: fz(["q"]), v: "SearchHit[]", patches: fz([]) }),
  waiting: O({ args: fz([O({ ids: "ids?", stocks: "stocks?" })]), v: "Waiting[]", patches: fz([]) }),
  since: O({ args: fz(["id", "t"]), v: "{ said, at } | null", patches: fz([]) }),
  photo: O({ args: fz(["id"]), v: "Blob | null", patches: fz([]) }),
  sendText: O({ args: fz(["id", "text", O({ way: "str:20?", kind: "str:20?", replyTo: "id?", at: "t?" })]), v: "{ id }", patches: fz(["outbox", "chat:", "rows"]) }),
  sendBlob: O({ args: fz(["id", "blob", "media"]), v: "{ id }", patches: fz(["outbox", "chat:", "rows"]) }),
  note: O({ args: fz(["id", "id", "text"]), v: "{ ok }", patches: fz(["chat:"]) }),
  react: O({ args: fz(["id", "id", "emoji"]), v: "{ ok }", patches: fz(["chat:"]) }),
  recall: O({ args: fz(["id", "id"]), v: "{ ok }", patches: fz(["chat:", "rows"]) }),
  read: O({ args: fz(["id"]), v: "{ ok }", patches: fz(["rows", "unread"]) }),
  draft: O({ args: fz(["id", "text"]), v: "{ ok }", patches: fz([]) }),
  share: O({ args: fz(["card", "words"]), v: "Row[]", patches: fz([]) }),
  rank: O({ args: fz(["card"]), v: "{ [id]: { why, score } }", patches: fz([]) }),
  sendRun: O({ args: fz([O({ card: "card", words: "words", pick: "ids", when: "str:20?", ask: B, plan: B, note: "text?" })]), v: "SendResult", patches: fz(["send", "outbox", "rows"]) }),
  safety: O({ args: fz(["id"]), v: "{ digits, verified, keyChanged }", patches: fz([]) }),
  verify: O({ args: fz(["id", "bool"]), v: "{ ok }", patches: fz(["friends", "keywarn"]) }),
  trust: O({ args: fz(["id"]), v: "{ ok }", patches: fz(["friends", "keywarn", "rows"]) }),
  meta: O({ args: fz(["name", "obj"]), v: "the endpoint's JSON | Blob", patches: fz(["me", "friends", "groups", "requests"]) }),
});
// (the rules a few args use beyond the header's list: "media" = "photo" | "voice"; "stocks" = an array of at most 50
// { sym?: string ≤ 12, name?: string ≤ 60 }; "str:N" a string of at most N characters)

// META: name → { methods: { [HTTP method]: { q: [query keys], b: [body keys] } }, path: how the path is built, blob? }.
// q keys go in the query string (encodeURIComponent each), b keys in the JSON body; no other key is accepted. A path
// with <x> takes x from args (an "id" rule). Written from pigeon/app.js's api( calls (and the line each was read at).
const M = (methods, path, o = {}) => O({ methods: O(Object.fromEntries(Object.entries(methods).map(([k, v]) => [k, O({ q: fz(v.q || []), b: fz(v.b || []) })]))), path, ...o });
export const META = fz({
  me: M({ GET: {}, PATCH: { b: ["notify", "skin", "moon", "pigeons", "newChats", "noted", "allChats", "risky", "autoLocation", "lat", "lon", "place", "notifyEmail", "showOnline", "showTyping", "receipts", "shareNews", "approxLocation", "shareTracker"] } }, "me"),   // 5561, 6404, 9964, 10019 (the privacy toggles 7594-7599), 10095-10207, 11046, 11066; never appearance (InFlite's own applies, S3-Q3)
  friends: M({ POST: { b: ["handle"] }, DELETE: { b: ["id"] } }, "friends"),                    // 7120, 9864, 9876
  "friends-respond": M({ POST: { b: ["id", "accept"] } }, "friends-respond"),                // 9825
  "friend-status": M({ GET: { q: ["h"] } }, "friend-status"),                                // 7090
  block: M({ POST: { b: ["id"] }, DELETE: { b: ["id"] } }, "block"),                          // 9835, 9843
  mutuals: M({ GET: { q: ["with"] } }, "mutuals"),                                           // 6788, 9941
  groups: M({ POST: { b: ["name", "members"] } }, "groups"),                                  // 10291
  "group-add": M({ POST: { b: ["id", "members"] } }, "group-add"),                            // 10292
  "group-name": M({ POST: { b: ["id", "name"] } }, "group-name"),                             // 10282
  "group-leave": M({ POST: { b: ["id"] } }, "group-leave"),                                   // 9564
  "group-mute": M({ POST: { b: ["id", "muted"] } }, "group-mute"),                            // 9539, 9596
  "flight-log": M({ GET: {} }, "flight-log"),                                                // 6336, 11085
  loft: M({ GET: { q: ["id"] } }, "loft"),                                                   // 6378
  feathers: M({ GET: {} }, "feathers"),                                                      // 6372
  "feathers-buy": M({ POST: { b: ["item"] } }, "feathers-buy"),                               // 9454
  "bird-wear": M({ POST: { b: ["bird", "item"] } }, "bird-wear"),                             // 6393
  "bird-retire": M({ POST: { b: ["id"] } }, "bird-retire"),                                   // 9476
  skies: M({ GET: {} }, "skies"),                                                            // 8886
  "wind-grid": M({ GET: { q: ["s", "n", "w", "e"] } }, "wind-grid"),                    // 1987-1995
  "route-plan": M({ GET: { q: ["with", "pigeon", "bird"] } }, "route-plan"),                  // 1406
  "wx-plan": M({ GET: { q: ["with"] } }, "wx-plan"),                                         // 6815
  way: M({ POST: { b: ["with", "group", "way"] } }, "way"),                                   // 9976
  wave: M({ POST: { b: ["id"] } }, "wave"),                                                   // 9494
  news: M({ GET: {} }, "news"),                                                              // 5393
  "gif-search": M({ GET: { q: ["q", "offset"] } }, "gif-search"),                             // 10395 (the search words go to the GIF service, as today: not message words)
  "time-offer": M({ POST: { b: ["id", "kind", "start", "stop", "tz", "with", "role", "state", "opts"] } }, "time-offer"),   // 12046 timeBody; 12065, 12082, 12137
  together: M({ GET: { q: ["with", "sport", "wid", "after"] } }, "together"),                 // 11536, 11977
  "fit-offer": M({ POST: { b: ["id", "start", "stop", "tz", "sport", "wid", "name", "secs", "who", "role", "far", "dry", "with", "state", "opts", "re"] } }, "fit-offer"),   // 11305, 11312, 11325, 11333
  "fit-share": M({ POST: { b: ["day", "tz", "sport", "drop"] } }, "fit-share"),               // 11342, 11347
  "card-now": M({ POST: { b: ["items"] } }, "card-now"),                                      // 11209
  "my-card": M({ GET: { q: ["kind", "tz", "sym"] } }, "my-card"),                             // 11792, 11912
  "share-rank": M({ POST: { b: ["kind", "ids"] } }, "share-rank"),                            // 11398
  avatar: M({ GET: { q: ["v"] } }, "avatar/<id>", { blob: true }),                            // 1110 (raw: a Blob for media.js/the views to make an object URL of)
  gif: M({ GET: { q: ["s"] } }, "gif/<id>", { blob: true }),                                  // 10421, 10432 (s: "p" preview | "f" full)
});
// ==== end of the frozen tables ====

// ---- B0's stub body (CORE writes the real one): hello answers; every other call is refused with why "no"; nothing is
// read or written.
export const STUB = true;
void get; void set; void del; void underLock; void E2E; void normCard; void waitingDigest; void linkParts;
const lazyRank = () => import("../rank.js");
void lazyRank;
if (typeof self !== "undefined" && typeof self.postMessage === "function" && typeof WorkerGlobalScope !== "undefined") {
  self.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d !== "object" || !Number.isInteger(d.id)) return;
    self.postMessage(d.m === "hello" ? { id: d.id, ok: true, v: { protocol: PROTOCOL } } : { id: d.id, ok: false, why: "no" });
  });
}
