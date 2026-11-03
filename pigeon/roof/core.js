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
import { get, set as setRaw, del, locked, gone, isGone, wipe } from "./idb.js";
import { E2E, uuid } from "../crypto.js";
import { normCard, payloadParts, buildPayload, padPayload, canForward, landWords, nextLocal, pigeonsFor, sentToast, askWords, cardWords, MARGIN_MS, ASK_KINDS } from "../cards.js";
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


// ==== CORE's body ====
// What it is: a port of pigeon/app.js's UI-free parts (S3-D5). The functions of the parity list are copied verbatim
// (roofchatcore.test.mjs compares each with app.js's, whitespace aside): the trust gate, pins, pairs, decrypt. Around
// them, the names they reach for (toast, render, loadChat, S.view, …) are the core's own: render() sends patches, toast()
// says only that a key warning is up (keywarn), never words, and "on screen" is the Chats screen shown and the page
// visible (risk I14.8), never document.visibilityState (there's no document here).
export const STUB = false;
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const SPEED_KMH = 80, RISKY_SPEED = 1.25, POLL_MS = 15000;
const KINDS = [["standard", "Standard", 1, 0], ["swift", "Swift", 2, 9], ["turbo", "Turbo", 3, 3], ["rocket", "Rocket", 9, 1]];
const KIND = Object.fromEntries(KINDS.map(([id, name, speed, max]) => [id, { name, speed, max }]));
KIND.dumb = { name: "Dumb", speed: 1 / 3, max: 0 }; KIND.mystery = { name: "Mystery", speed: 1, max: 1 };
KIND.lunar = { name: "Lunar", speed: 1, max: 3 }; KIND.lunarx = { name: "Lunar Express", speed: 1, max: 1 };
KIND.laser = { name: "Laser", speed: 1, max: 5 }; KIND.orbital = { name: "Orbital", speed: 1, max: 2 };
const PAID = ["swift", "turbo", "rocket"];
const NO_SIGNAL = "No signal. Try again when you have some.";
const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const ONLINE_MS = 150e3;
const CACHE_V = 1, CACHE_CHATS = 12, WIN = 50, HIDDEN_DROP = 10 * MIN;
const MY_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return null; } })();

/* ---------------- state: app.js's S (910-927) less every view field ---------------- */
const S = {
  token: null, me: null, priv: null, myPub: null, fp: "",
  friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [], skew: 0,
  view: "none", chat: null,
  msgs: new Map(), turns: new Map(), plain: new Map(), notes: new Map(), pairs: new Map(), pins: {}, pctx: new Map(),
  chatRaw: new Map(), outbox: [], outGone: new Set(), reacts: new Map(), fly: new Map(), lines: new Map(), gevents: new Map(),
  drafts: new Map(), draftsTouched: new Set(), seenLanded: new Set(), birds: [], hall: [], feathers: 0, stocks: [],
  // (the core's own: the lock, from the first call; what the page says of itself; the rows window; a chat's window)
  locked: true, visible: false, screen: false, shown: false, offline: false, ended: false, keyNeeded: false, started: false,
  rowWin: [0, 0], win: new Map(), synced: false, fromCache: false, raw: null, syncSig: "", syncFails: 0, lastSync: 0,
  live: { since: Date.now(), seen: new Map(), typingIn: new Map(), typingOut: null, typingOk: true, quietSince: Date.now(), timer: 0, fails: 0, off: false,
    busy: false, again: false, lastAt: 0, next: 3000, okAt: 0, keyAt: 0, after: new Map(), fullAt: new Map(), tsig: "", force: false, forceChat: false },
};
const now = () => Date.now() + S.skew;
// (pins: read, merged with mergePins and written under the lock, as another tab may have trusted a key meanwhile;
// every other key as it is: S3-D4, risk I9)
const set = (k, v) => (/^pins:/.test(k) ? locked(k, async () => { const had = await get(k); return setRaw(k, had && typeof had === "object" && v && typeof v === "object" ? mergePins(v, had) : v); }) : setRaw(k, v));
const idb = { get, set, del };
void linkParts;
const first = (n) => String(n).trim().split(/\s+/)[0];
function friend(id) { return S.friends.find((f) => f.id === id); }
const chatOf = (key) => friend(key) || group(key);
const kindOf = (m) => (m && Object.hasOwn(KIND, m.pigeon) ? m.pigeon : m?.swift ? "swift" : "standard");
const pigeonsOn = () => S.me?.pigeons !== false;
const isOnline = (p) => !!p?.seenAt && now() - p.seenAt < ONLINE_MS;
const flightMs = (km, speed = 1) => Math.min(3 * DAY, Math.max(5 * MIN, (km / SPEED_KMH) * HOUR)) / speed;
const memberKm = (p) => p.lat != null && S.me.lat != null ? haversineKm(S.me.lat, S.me.lon, p.lat, p.lon) : p.km ?? 500;
const mySpeed = (kind) => KIND[kind].speed * (S.me?.risky ? RISKY_SPEED : 1);
const endFor = (p) => (p?.moon ? { b: p.moon.b === "mars" ? "mars" : "moon", lat: p.moon.lat, lon: p.moon.lon, place: p.place } : p?.lat != null ? { b: "earth", lat: p.lat, lon: p.lon, place: p.place } : null);
const worldOf = (p) => (p?.moon ? (p.moon.b === "mars" ? "mars" : "moon") : p?.offEarth || "earth");
// (space pigeons' flight times are pigeon/space.js's, which the core graph doesn't carry: nothing here seals a group's
// letter by pigeon to the Moon, so memberMs, kept verbatim, falls back to the Earth's sum for one off the Earth)
const spaceKinds = () => null, spaceMs = () => 0;
function haversineKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180, s = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLon - aLon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
}
// (a timer that doesn't keep anything alive where that means something: node, for the unit tests; a number in a Worker)
const unref = (t) => (t?.unref?.(), t);
const fold = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------------- the wire ---------------- */
const post = (m) => { try { self.postMessage(m); } catch (_) {} };
const emit = (topic, data) => post({ t: "patch", topic, data: data ?? null });
const onScreen = () => S.screen && S.visible && !S.locked;
const ready = () => !!(S.token && S.me && S.priv);
function stateNow() {
  if (S.ended) return "ended";
  if (!ready()) return S.keyNeeded ? "key" : "signin";
  if (S.locked) return "locked";
  if (S.offline && !S.synced && !S.fromCache) return "offline";
  return "ready";
}
let lastState = null;
function emitState() { const st = stateNow(); if (st !== lastState) { lastState = st; emit("state", { state: st }); } return st; }

/* ---------------- the server (app.js's api, 1001-1028: no renderOffline/go; patches offline and ended) ---------------- */
let meTurn = 0, meOut = 0;
const offlineErr = () => Object.assign(new Error("You’re offline. Check your connection and try again."), { offline: true });
function setOffline(on) { if (S.offline === on) return; S.offline = on; emitState(); }
async function api(path, { method = "GET", body, form, raw } = {}) {
  if (isGone()) throw Object.assign(new Error("gone"), { why: "no" });
  const headers = {};
  if (S.token) headers.Authorization = "Bearer " + S.token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const quit = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(payload instanceof FormData ? 90000 : raw ? 120000 : 25000) : undefined;
  const mine = path === "me" && method === "PATCH";
  if (mine) { meTurn++; meOut++; }
  let r;
  try { r = await fetch("/api/pigeon/" + path, { method, headers, body: payload, signal: quit }); }
  catch (_) { setOffline(true); throw offlineErr(); }
  finally { if (mine) { meTurn++; meOut--; } }
  setOffline(false);
  if (raw && r.ok) return r;
  if (r.ok && !/json/.test(r.headers.get("Content-Type") || "")) { setOffline(true); throw offlineErr(); }
  let data = {};
  try { data = await r.json(); } catch (_) {}
  // (a sign-in that has ended: this phone's copy goes, sealed letters and drafts kept for you, as Chat does; state ended)
  if (r.status === 401 && S.token && data.field === "session") { await forget(true); S.ended = true; emitState(); }
  if (!r.ok) throw Object.assign(new Error(data.error || `Something went wrong (error ${r.status}). Try again.`), { status: r.status, field: data.field });
  return data;
}
// (the core's own stand-ins for what the verbatim functions reach for)
function toast() { emitKeywarn(); }            // checkMyKey's warning: the page draws it from keywarn, in its own words
function render() { if (!started) return; emitLists(); emitOpen(); }
function renderSheet() {}


/* ---------- copied verbatim from pigeon/app.js (S3-D5; roofchatcore.test.mjs keeps them the same): keys, pins, the
   trust gate, pairs, decrypt, groups ---------- */
let pinsTimer = 0;
const keyId = (pub) => `${pub.x}.${pub.y}`;
const pubFromId = (k) => { const [x, y] = k.split("."); return { kty: "EC", crv: "P-256", x, y }; };
function mergePins(mine, theirs) {
  const out = { ...theirs, ...mine };
  for (const [k, v] of Object.entries(theirs)) {
    if (/^(old|g):/.test(k) && Array.isArray(v) && Array.isArray(mine[k])) out[k] = [...new Set([...mine[k], ...v])];
    else if (k.startsWith("v:") && !(k in mine) && v && v !== out[k.slice(2)]) delete out[k];
  }
  return out;
}
function pairFor(pub) {
  const k = keyId(pub);
  if (!S.pairs.has(k)) S.pairs.set(k, E2E.pair(S.priv, pub));
  return S.pairs.get(k);
}
function trustedPub(p) {
  if (!p?.pub) throw new Error("They’re not in your friends any more.");
  if (p.keyChanged) throw new Error(`${first(p.name || "Their")}’s security key changed. Check their safety number first.`);
  return p.pub;
}
const keysOf = (p) => [p.keyChanged ? null : keyId(p.pub), S.pins[p.id], ...(S.pins["old:" + p.id] || [])].filter((k, i, a) => k && a.indexOf(k) === i);
const shapeOK = (kind, o) => !!o && typeof o === "object" && !Array.isArray(o) && (kind === "react"
  ? REACTIONS.includes(o.r) && (Object.keys(o).length === 1 || (Object.keys(o).length === 2 && typeof o.m === "string"))
  : typeof o.t === "string" && !("r" in o) && !("k" in o));
const ctxOf = (kind, m, scope) => `${kind}|${scope}|${m.from}|${m.to || ""}`;
function keepPlain(id, ctx, o) {
  const had = S.pctx.get(id);
  if (had && had !== ctx) { S.plain.set(id, { t: "", bad: true }); return; }
  S.pctx.set(id, ctx); S.plain.set(id, o);
}
async function decrypt(fid, m, kind = m.stopover ? "via" : "msg") {
  const ctx = ctxOf(kind, m, fid);
  if (!m.ct || seenPlain(m.id, ctx)) return;
  const f = friend(fid);
  const tries = keysOf(f);
  for (const k of tries) {
    try {
      const o = await E2E.open(await pairFor(pubFromId(k)), { id: m.id, from: m.from, to: m.to, type: kind }, m.ct);
      return keepPlain(m.id, ctx, shapeOK(kind, o) ? o : { t: "", bad: true });
    } catch (_) {}
  }
  keepPlain(m.id, ctx, { t: "", bad: true, unchecked: !!f.keyChanged });
}
async function decryptGroup(g, m, kind = "msg") {
  const ctx = ctxOf(kind, m, g.id);
  if (!m.body || !m.key || seenPlain(m.id, ctx)) return;
  const from = m.from === S.me.id ? { id: S.me.id, pub: S.myPub || S.me.pub } : member(g, m.from);
  const tries = !from ? [] : from.id === S.me.id ? [keyId(from.pub)] : keysOf(from);
  for (const k of tries) {
    try {
      const w = await E2E.open(await pairFor(pubFromId(k)), { id: m.id, from: m.from, to: S.me.id, type: "wrap" }, m.key);
      // the sender's sealed key vouches for the body (v2); an older body has no hash to check
      if (w.h ? (await E2E.hash(m.body)) !== w.h : JSON.parse(m.body).v !== 1) throw new Error("not the sender’s body");
      const o = await E2E.openGroup({ id: m.id, from: m.from, group: g.id, type: kind }, w.k, m.body);
      return keepPlain(m.id, ctx, shapeOK(kind, o) ? o : { t: "", bad: true });
    } catch (_) {}
  }
  keepPlain(m.id, ctx, { t: "", bad: true, unchecked: !!from?.keyChanged });
}
function group(id) { return S.groups.find((g) => g.id === id); }
const member = (g, id) => g?.members.find((p) => p.id === id);
const others = (g) => g.members.filter((p) => p.id !== S.me.id);
const memberMs = (p, k) => {
  if (!S.me.moon && !p.onMoon && !p.moon) return flightMs(memberKm(p), mySpeed(k));
  const a = endFor(S.me), b = endFor(p) || { b: worldOf(p), lat: 0, lon: 0 }, sk = spaceKinds(a, b);
  return sk ? spaceMs(sk[0], a, b) : flightMs(memberKm(p), mySpeed(k));
};
async function pinsCatchUp() {
  const tok = S.token; let p;
  try { p = await serverPins(); } catch (_) { return false; }
  if (S.token !== tok) return false;
  S.pinsUnread = false; await idb.del("pinsunread:" + S.me.id);
  if (p) S.pins = mergePins(p, S.pins);
  savePins();
  return true;
}
async function restorePins() {
  const tok = S.token, id = S.me.id;
  S.pinsUnread = !!(await idb.get("pinsunread:" + id).catch(() => null));
  if (Object.keys(S.pins).length) return;
  let p;
  // (a sign-in that had ended signs out as it's asked: that's not "no answer", and start carries on to the welcome)
  try { p = await serverPins(); } catch (_) { if (S.token === tok) { S.pinsUnread = true; await idb.set("pinsunread:" + id, 1); } return; }
  if (p && S.token === tok) { S.pins = p; await idb.set("pins:" + id, S.pins); await idb.set("pinsup:" + id, Date.now()); }
}
async function serverPins() {
  const r = await api("pins");
  const p = r.pins ? await E2E.open(await pairFor(S.myPub), pinsMeta(), r.pins).catch(() => null) : null;
  return p?.pins && typeof p.pins === "object" ? p.pins : null;
}
function savePins() {
  if (!S.me) return;
  idb.set("pins:" + S.me.id, S.pins);
  clearTimeout(pinsTimer);
  pinsTimer = setTimeout(async () => {
    if (S.pinsUnread) return;                    // (kept on the phone till then: pinsCatchUp saves it)
    try {
      const had = await serverPins();            // (what another of your phones saved since stays)
      if (had) { S.pins = mergePins(S.pins, had); await idb.set("pins:" + S.me.id, S.pins); }
      const ct = await E2E.seal(await pairFor(S.myPub), pinsMeta(), { pins: S.pins, at: Date.now() });
      await api("pins", { method: "POST", body: { pins: ct } }); await idb.set("pinsup:" + S.me.id, Date.now());
    } catch (_) {}
  }, 1500);
}
function checkPin(f) {
  const k = keyId(f.pub);
  if (!S.pins[f.id]) { S.pins[f.id] = k; savePins(); }
  f.keyChanged = S.pins[f.id] !== k;
}
async function trustNewKey(fid) {
  const f = friend(fid) || S.groups.map((g) => member(g, fid)).find(Boolean); if (!f) return;
  const old = S.pins[fid], hist = S.pins["old:" + fid] || [];
  if (old && old !== keyId(f.pub) && !hist.includes(old)) S.pins["old:" + fid] = [...hist, old];
  S.pins[fid] = keyId(f.pub); savePins();
  f.keyChanged = false;
  for (const x of [friend(fid), ...S.groups.map((g) => member(g, fid))]) if (x) x.keyChanged = false;   // the same person, wherever they appear
  for (const [id, p] of S.plain) if (p.unchecked) S.plain.delete(id);     // now they can be opened
  if (friend(fid)?.last) await decrypt(fid, friend(fid).last);
  for (const g of S.groups) if (g.last) await decryptGroup(g, g.last);
  if (S.view === "chat" && (S.chat === fid || group(S.chat))) await loadChat(S.chat).catch(() => {});
  render();
}
function setVerified(p, on) { S.pins["v:" + p.id] = on ? keyId(p.pub) : ""; savePins(); }
const isVerified = (p) => !!p?.pub && !p.keyChanged && S.pins["v:" + p.id] === keyId(p.pub);
const wasVerified = (p) => !!p?.keyChanged && !!S.pins["v:" + p.id];
const seenPlain = (id, ctx) => S.plain.has(id) && (!S.pctx.has(id) || S.pctx.get(id) === ctx);
const base = (fid) => pairFor(trustedPub(friend(fid)));
function checkMyKey(me) {
  S.keyBad = !!(S.myPub && me?.pub && keyId(me.pub) !== keyId(S.myPub));
  if (!S.keyBad || S.keyWarned || S.locked) return;
  S.keyWarned = true;
  toast("<b>Your security key doesn’t match</b><br>The server is showing a different key for you than the one on this phone. Don’t send anything private, and sign out and back in.");
}
const pinsMeta = () => ({ type: "pins", id: "pins", from: S.me.id, to: S.me.id });

/* ---------------- sync (app.js 3281-3362: patches for calmRender; pinsWait kept verbatim) ---------------- */
let syncing = null, started = false;
const syncPath = (quiet) => (quiet ? "sync?quiet=1" : "sync");
async function sync(quiet = !onScreen()) {
  if (!S.token || !S.priv) return;
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      if (S.pinsWait) { await S.pinsWait; if (!S.token) return; }      // (the keys trusted before, still being fetched at the start: first)
      const tok = S.token, turn = meTurn, d = await api(syncPath(quiet));
      if (S.token !== tok) return;
      if (!Number.isFinite(d.now) || !d.me || !Array.isArray(d.friends)) throw new Error("A sync came back incomplete.");
      if (S.me && (turn !== meTurn || meOut) && d.me.id === S.me.id) d.me = { ...d.me, ...S.me };
      S.skew = d.now - Date.now();
      checkMyKey(d.me);
      const caught = S.pinsUnread && await pinsCatchUp();
      if (S.token !== tok) return;
      const sig = JSON.stringify({ ...d, now: 0 }, (k, v) => (k === "seenAt" ? undefined : v)), same = sig === S.syncSig && S.synced && !caught;
      S.syncSig = sig; S.syncFails = 0; S.lastSync = Date.now();
      if (!same) { S.raw = d; await applySync(d); }
      else { S.raw = d; for (const f of d.friends) { const o = friend(f.id); if (o) o.seenAt = f.seenAt; } }
      S.started = true;
      if (S.view === "chat" && S.chat && !S.locked && onScreen() && chatDue(S.chat)) await loadChat(S.chat).catch(() => {});
      S.live.forceChat = false;
      if (S.token !== tok) return;
      S.fromCache = false; S.synced = true;
      emitState(); emitLists(); emitOpen();
      cacheSave();
      if (S.outbox.length) outboxFlush();
    } catch (e) { if (e.status !== 401) S.syncFails++; }
    finally { syncing = null; }
  })();
  return syncing;
}
// What the server says (fresh, or the copy kept on this phone): friends, groups and each chat's last message, opened
// with the key on this phone (app.js applySync, less its toasts, themes and the sky)
async function applySync(d) {
  S.me = d.me; S.friends = d.friends; S.groups = d.groups || []; S.incoming = d.incoming || []; S.outgoing = d.outgoing || []; S.blocked = d.blocked || []; S.passkeys = d.passkeys || [];
  S.birds = d.birds?.birds || []; S.hall = d.birds?.hall || []; S.feathers = d.feathers ?? S.feathers ?? 0;
  S.hold = d.hold && typeof d.hold === "object" ? d.hold : null; S.times = Array.isArray(d.times) ? d.times : []; S.rides = Array.isArray(d.rides) ? d.rides : [];
  for (const f of S.friends) {
    checkPin(f);
    if (f.last) await decrypt(f.id, f.last);
    if (f.last && !f.last.flying && !f.last.lost && !f.last.waiting) S.seenLanded.add(f.last.id);
  }
  for (const g of S.groups) {
    for (const p of g.members) if (p.id !== S.me.id) checkPin(p);
    const known = S.pins["g:" + g.id], ids = g.members.map((p) => p.id);
    if (!known) { S.pins["g:" + g.id] = ids; savePins(); }
    g.unseen = known ? ids.filter((id) => !known.includes(id)) : [];
    if (g.last) await decryptGroup(g, g.last);
  }
}
/* ---------- a chat's messages (app.js loadChat 3567, applyChat, applyDelta: read only on screen) ---------- */
const kept = (m, t = now()) => { const end = m.lost ? m.lostAt || m.deliverAt : m.deliverAt; return !!end && end + 30 * DAY < t && !(m.flock || []).some((x) => !x.lost && x.deliverAt + 30 * DAY >= t); };
function vanished(m, t = now()) {
  if (!m?.vanish) return false;
  if (m.vanishAt) return m.vanishAt <= t;
  if (m.flock) { const fl = m.flock.filter((x) => !x.lost); return fl.length > 0 && fl.every((x) => x.readAt) && Math.max(...fl.map((x) => x.readAt)) + m.vanish <= t; }
  if (m.gid) return false;
  return !!m.readAt && m.readAt + m.vanish <= t;
}
const chatSigs = new Map(), chatTags = new Map();
async function loadChat(fid, pre) {
  const g = group(fid), tok = S.token;
  const tag = S.msgs.has(fid) && chatTags.get(fid);
  const d = pre || await api((g ? "group-messages?id=" : "messages?with=") + encodeURIComponent(fid) + (tag ? "&tag=" + encodeURIComponent(tag) : ""));
  if (S.token !== tok) return;
  S.skew = d.now - Date.now();
  if (!g && Number.isFinite(d.now)) { S.live.after.set(fid, d.now); S.live.fullAt.set(fid, Date.now()); }
  if (d.same) { if (S.msgs.has(fid) && chatTags.get(fid) === d.tag) return; chatTags.delete(fid); return loadChat(fid); }
  if (d.tag) chatTags.set(fid, d.tag); else chatTags.delete(fid);
  const sig = JSON.stringify({ ...d, now: 0 });
  if (chatSigs.get(fid) === sig && S.msgs.has(fid)) return;
  chatSigs.set(fid, sig);
  S.chatRaw.delete(fid); S.chatRaw.set(fid, d); cacheSave();
  await applyChat(fid, d, true);
}
const unreadIn = (fid, g) => (m) => (g ? m.from !== S.me.id : m.from === fid && !m.stopover) && !m.flying && !m.lost && !m.readAt;
// (read: only the chat the page has open, shown, with the page visible, and never locked)
function markRead(fid, list) {
  const g = group(fid);
  if (!(S.view === "chat" && S.chat === fid && onScreen()) || !list.some(unreadIn(fid, g))) return;
  api(g ? "group-read" : "read", { method: "POST", body: g ? { id: fid } : { with: fid } }).catch(() => {});
  for (const m of list) if ((g ? m.from !== S.me.id : m.from === fid) && !m.flying && !m.lost) m.readAt = m.readAt || now();
  const x = g || friend(fid); if (x) x.unread = 0;
}
async function applyChat(fid, d, live) {
  if (!live && d.messages?.some((m) => kept(m))) d = { ...d, messages: d.messages.filter((m) => !kept(m)) };
  if (d.messages?.some((m) => vanished(m))) {
    for (const m of d.messages) if (vanished(m)) { S.plain.delete(m.id); S.pctx.delete(m.id); }
    d = { ...d, messages: d.messages.filter((m) => !vanished(m)) };
  }
  const g = group(fid), open = (m, kind) => (g ? decryptGroup(g, m, kind) : decrypt(fid, m, kind));
  if (!g && !friend(fid)) return;
  if (!Array.isArray(d.messages)) return;
  for (const r of d.reacts || []) await open(r, "react");
  for (const m of d.messages) {
    await open(m);
    if (!g && m.note && m.via) await openNote(m.id, m.via, S.me.id, m.note);
    if (!g && m.stopover && m.mine) await openNote(m.id, S.me.id, m.finalTo, m.mine);
  }
  if (!live && S.msgs.has(fid)) return;
  if (!live) chatTags.delete(fid);
  S.msgs.set(fid, d.messages); S.turns.set(fid, d.turn && { ...d.turn, at: d.now || 0 }); S.reacts.set(fid, d.reacts || []); if (!g) S.fly.set(fid, d.fly || []);
  if (!g) { S.lines.set(fid, Array.isArray(d.lines) ? d.lines.filter((x) => x && typeof x.by === "string" && Number.isFinite(x.at)) : []); const f = friend(fid); if (f && (d.way === "instant" || d.way === "pigeon")) f.way = d.way; if (f && (d.theirWay === "instant" || d.theirWay === "pigeon")) f.theirWay = d.theirWay; }
  if (g) S.gevents.set(fid, d.events || []);
  if (live) markRead(fid, d.messages);
}
async function applyDelta(fid, d) {
  const f = friend(fid); if (!f || !Array.isArray(d.messages)) return;
  const L = S.live;
  if (Number.isFinite(d.now)) { S.skew = d.now - Date.now(); L.after.set(fid, d.now); }
  const list = [...(S.msgs.get(fid) || [])], at = new Map(list.map((m, i) => [m.id, i]));
  const gone = new Set(Array.isArray(d.gone) ? d.gone.filter((x) => typeof x === "string") : []);
  for (const r of d.reacts || []) await decrypt(fid, r, "react");
  for (const m of d.messages) {
    if (vanished(m)) { gone.add(m.id); S.plain.delete(m.id); S.pctx.delete(m.id); continue; }
    await decrypt(fid, m);
    if (m.note && m.via) await openNote(m.id, m.via, S.me.id, m.note);
    if (m.stopover && m.mine) await openNote(m.id, S.me.id, m.finalTo, m.mine);
    if (at.has(m.id)) list[at.get(m.id)] = m; else list.push(m);
    if (m.from === fid && L.typingIn.has(fid) && !m.flying) { L.typingIn.delete(fid); L.tsig = typingSig(); }
  }
  for (const id of gone) { S.plain.delete(id); S.pctx.delete(id); }
  S.msgs.set(fid, list.filter((m) => !gone.has(m.id)).sort((a, b) => a.sentAt - b.sentAt));
  const ids = new Set(d.messages.map((m) => m.id));
  S.reacts.set(fid, [...(S.reacts.get(fid) || []).filter((r) => !ids.has(r.msg) && !gone.has(r.msg)), ...(Array.isArray(d.reacts) ? d.reacts : [])]);
  if (d.turn) S.turns.set(fid, { ...d.turn, at: d.now || 0 });
  if (d.way === "instant" || d.way === "pigeon") f.way = d.way;
  if (d.theirWay === "instant" || d.theirWay === "pigeon") f.theirWay = d.theirWay;
  markRead(fid, S.msgs.get(fid));
}
// A stopover's line is sealed between the friend it stopped with and the recipient (app.js openNote)
async function openNote(id, from, to, ct) {
  if (S.notes.has(id)) return;
  const other = friend(from === S.me.id ? to : from); if (!other) return;
  for (const k of keysOf(other)) {
    try { const o = await E2E.open(await pairFor(pubFromId(k)), { id: id + ":via", from, to, type: "note" }, ct); if (typeof o?.t === "string") S.notes.set(id, o.t); return; } catch (_) {}
  }
}

/* ---------- the pulse (app.js 3641-3855), only while the Chats screen shows and the page is visible ---------- */
const pulseOpen = () => (S.view === "chat" && S.chat ? S.chat : "");
function pulseWanted() {
  const L = S.live;
  if (L.off || !S.token || !S.me || !S.priv || !onScreen() || S.offline) return false;
  return (S.view === "chat" && !!S.chat) || S.view === "messages";
}
const typingSig = () => [...S.live.typingIn].map(([k, v]) => `${k}:${v.ids.join(",")}`).sort().join("|");
function typingSay(open) {
  const L = S.live, out = L.typingOut;
  const can = !!open && S.view === "chat" && L.typingOk && S.me?.showTyping !== false && onScreen() && !!(S.drafts.get(open) || "").trim();
  if (can && L.keyAt > (out?.at || 0) && (!out || out.chat !== open || Date.now() - out.at >= 3000)) return "typing";
  if (out && (!can || out.chat !== open)) return "stop";
  return null;
}
function pulseNow() {
  const L = S.live;
  if (L.busy) { L.again = true; return; }
  clearTimeout(L.timer);
  L.timer = setTimeout(pulse, Math.max(0, 1050 - (Date.now() - L.lastAt)));
}
async function pulse() {
  const L = S.live;
  clearTimeout(L.timer); L.timer = 0;
  if (L.busy || L.off || !pulseWanted()) return;
  const open = pulseOpen(), body = { since: L.since, open }, ty = typingSay(open);
  if (open !== L.quietFor) { L.quietFor = open; L.quietSince = Date.now(); }
  if (ty === "typing") { body.typing = open; L.typingOut = { chat: open, at: Date.now() }; L.quietSince = Date.now(); }
  else if (ty === "stop") { body.stop = L.typingOut.chat; L.typingOut = null; }
  L.busy = true; L.lastAt = Date.now();
  const tok = S.token;
  let wait = L.next || 3000;
  try {
    const r = await fetch("/api/pigeon/pulse", { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(15000) : undefined });
    if (S.token !== tok) return;
    if (r.status === 404) { L.off = true; return; }
    if (r.status === 429) { const d = await r.json().catch(() => ({})); wait = Math.max(250, Number(d.retry) || 1000); if (body.stop && !L.typingOut) L.typingOut = { chat: body.stop, at: 0 }; return; }
    if (!r.ok || !/json/.test(r.headers.get("Content-Type") || "")) throw new Error(`pulse ${r.status}`);
    const d = await r.json();
    L.fails = 0; L.okAt = Date.now();
    if (Number.isFinite(d.now)) L.since = d.now;
    if (Number.isFinite(d.next) && d.next >= 1000) L.next = d.next;
    wait = L.next;
    await pulseApply(d, open);
  } catch (_) {
    L.fails++;
    wait = Math.min(30000, (L.next || 3000) * 2 ** L.fails);
  } finally {
    L.busy = false;
    if (Date.now() - L.quietSince > 120e3) wait = Math.max(wait, 10000);
    if (L.again) { L.again = false; wait = Math.min(wait, Math.max(0, 1050 - (Date.now() - L.lastAt))); }
    clearTimeout(L.timer); L.timer = 0;
    if (!L.off && S.token === tok && pulseWanted()) L.timer = setTimeout(pulse, wait);
  }
}
async function pulseApply(d, open) {
  const L = S.live;
  if (d.typing === null) { L.typingOk = false; L.typingOut = null; }
  let listMoved = false;
  if (d.unread && typeof d.unread === "object") for (const f of S.friends) {
    if (S.view === "chat" && S.chat === f.id) continue;
    const n = Math.max(0, Number(d.unread[f.id]) || 0);
    if ((f.unread || 0) !== n) { f.unread = n; listMoved = true; }
  }
  let other = false;
  for (const c of Array.isArray(d.changed) ? d.changed : []) {
    if (!c || typeof c.chat !== "string" || L.seen.get(c.chat) === c.at) continue;
    L.seen.set(c.chat, c.at); L.quietSince = Date.now();
    if (c.chat === open && friend(open)) deltaFetch(open);
    else if (c.chat === open && group(open)) loadChat(open).then(emitOpen, () => {});
    else other = true;
  }
  if (other) syncSoon(S.view === "chat" ? 15e3 : 5e3);
  const ty = d.typing && typeof d.typing === "object" ? d.typing : {}, until = Date.now() + 7000, next = new Map();
  for (const [k, ids] of Object.entries(ty)) { const xs = Array.isArray(ids) ? ids.filter((x) => typeof x === "string" && x !== S.me?.id) : []; if (xs.length) next.set(k, { ids: xs, until }); }
  if (next.size) L.quietSince = Date.now();
  L.typingIn = next;
  const sig = typingSig();
  if (sig !== L.tsig) { L.tsig = sig; emitTyping(); }
  if (listMoved) emitLists();
}
let tickTimer = 0;
function pulseTick() {
  const L = S.live;
  if (L.typingIn.size) {
    for (const [k, v] of L.typingIn) if (v.until <= Date.now()) L.typingIn.delete(k);
    const sig = typingSig(); if (sig !== L.tsig) { L.tsig = sig; emitTyping(); }
  }
  if (pulseWanted()) { if (!L.timer && !L.busy) pulseNow(); }
  else { L.quietFor = null; if (L.timer) { clearTimeout(L.timer); L.timer = 0; } }
}
// the 1 s check runs only while the screen shows (S3-D10): no timer of the core's while hidden
function ticking() {
  if (onScreen() && ready()) { if (!tickTimer) { tickTimer = setInterval(pulseTick, 1000); tickTimer?.unref?.(); } }
  else if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; pulseHide(); }
}
function pulseHide() {
  const L = S.live;
  clearTimeout(L.timer); L.timer = 0; L.quietFor = null;
  L.fullAt.clear();
  if (L.off || !S.token) return;
  const body = { since: L.since, open: "" };
  if (L.typingOut) { body.stop = L.typingOut.chat; L.typingOut = null; }
  L.lastAt = Date.now();
  try { fetch("/api/pigeon/pulse", { method: "POST", keepalive: true, headers: { Authorization: "Bearer " + S.token, "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {}); } catch (_) {}
}
function chatDue(id) {
  const L = S.live, live = !L.off && Date.now() - L.okAt < 20e3;
  return !live || !!group(id) || !!L.forceChat || Date.now() - (L.fullAt.get(id) || 0) >= 60e3;
}
function syncSoon(gap) {
  const L = S.live, left = (S.lastSync || 0) + gap - Date.now();
  if (left <= 0) return sync();
  if (!L.syncTimer) L.syncTimer = setTimeout(() => { L.syncTimer = 0; sync(); }, left);
}
async function deltaFetch(fid) {
  const L = S.live;
  if (L.deltaBusy) { L.deltaAgain = fid; return; }
  L.deltaBusy = true;
  try {
    const after = L.after.get(fid), whole = !after || !S.msgs.has(fid) || Date.now() - (L.fullAt.get(fid) || 0) >= 60e3 || now() - after > 590e3;
    if (whole) await loadChat(fid);
    else {
      const tok = S.token, d = await api(`messages?with=${encodeURIComponent(fid)}&after=${encodeURIComponent(after)}`);
      if (S.token !== tok) return;
      if (d.delta) await applyDelta(fid, d); else await loadChat(fid, d);
    }
    if (S.view === "chat" && S.chat === fid) emitOpen();
  } catch (_) {}
  finally {
    L.deltaBusy = false;
    if (L.deltaAgain) { const x = L.deltaAgain; L.deltaAgain = null; if (S.view === "chat" && S.chat === x) deltaFetch(x); }
  }
}

/* ---------- the copy kept on this phone (app.js 3856-3907): written only once the Chats screen has been shown ---------- */
let cacheTimer = 0;
function cacheSave() {
  if (!S.shown) return;                // (Today alone keeps nothing: Chats' own copy is written by Chats, S3-D4, risk I15)
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    if (!S.me || !S.raw || !S.shown || isGone()) return;
    idb.set("cache:" + S.me.id, { v: CACHE_V, at: Date.now(), sync: S.raw, skies: null, chats: [...S.chatRaw].slice(-CACHE_CHATS) }).catch(() => {});
  }, 600);
}
async function cacheLoad() {
  let c = null; const me = S.me;
  try { c = await idb.get("cache:" + S.me.id); } catch (_) {}
  if (!c || c.v !== CACHE_V || !c.sync) return false;
  try {
    S.chatRaw = new Map(Array.isArray(c.chats) ? c.chats : []);
    S.raw = c.sync;
    await applySync(c.sync);
  } catch (_) {
    S.me = me;
    Object.assign(S, { raw: null, friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [], birds: [], hall: [], chatRaw: new Map(), msgs: new Map() });
    return false;
  }
  S.fromCache = true;
  return true;
}
/* ---------- drafts (app.js 3880-3915): sealed with your own key; merged by chat under the lock ---------- */
const draftsMeta = () => ({ type: "draft", id: "drafts", from: S.me.id, to: S.me.id });
let draftsTimer = 0;
const draftsSoon = () => { clearTimeout(draftsTimer); draftsTimer = setTimeout(draftsSave, 800); };
async function openDrafts(ct) {
  try { const o = await E2E.open(await pairFor(S.myPub), draftsMeta(), ct); return Array.isArray(o?.d) ? o.d.filter(([id, v]) => typeof id === "string" && typeof v === "string") : []; } catch (_) { return []; }
}
async function draftsSave() {
  clearTimeout(draftsTimer);
  if (!S.me || !S.priv || !S.myPub || isGone()) return;
  const me = S.me.id, key = "drafts:" + me;
  try {
    await locked(key, async () => {
      // (another tab's drafts for chats this one hasn't touched stay: by chat id)
      const there = new Map(await openDrafts(await idb.get(key)));
      for (const id of S.draftsTouched) there.delete(id);
      const d = new Map([...there, ...[...S.drafts].filter(([, v]) => v.trim())]);
      const ct = d.size ? await E2E.seal(await pairFor(S.myPub), draftsMeta(), { d: [...d] }) : null;
      if (S.me?.id !== me) return;
      if (ct) await idb.set(key, ct); else await idb.del(key);
    });
  } catch (_) {}
}
async function draftsLoad() {
  try {
    for (const [id, v] of await openDrafts(await idb.get("drafts:" + S.me.id))) if (v.trim() && !S.drafts.has(id)) S.drafts.set(id, v);
  } catch (_) {}
}
/* ---------- the outbox (app.js 10642-10760): sealed, never words; merged by id under the lock ---------- */
const outKey = () => "outbox:" + S.me.id;
const outShape = ({ id, to, path, meta, blob, kind, at, err }) => ({ id, to, path, meta, blob, kind, at, err });
async function outboxSave() {
  if (!S.me || isGone()) return;
  const key = outKey();
  try {
    await locked(key, async () => {
      // (one another tab, or Chat's own page, added meanwhile stays; one sent or deleted here doesn't come back)
      const there = ((await idb.get(key)) || []).filter((o) => o && o.id && !S.outGone.has(o.id) && !S.outbox.some((x) => x.id === o.id));
      for (const o of there) S.outbox.push(o);
      await idb.set(key, S.outbox.map(outShape));
    });
  } catch (_) {}
  emit("outbox", outView());
}
async function outboxAdd(o) { S.outbox.push(o); await outboxSave(); }
function outboxDrop(id) { S.outbox = S.outbox.filter((x) => x.id !== id); S.outGone.add(id); }
async function outboxLoad() {
  let list = [];
  try { list = (await idb.get(outKey())) || []; } catch (_) {}
  S.outbox = list.filter((o) => o && o.id);
  for (const o of S.outbox) { try { await outboxOpen(o); } catch (_) { o.err = o.err || "This pigeon couldn’t be opened on this phone."; } }
}
// what one says, opened again with this phone's key (no object URLs here: the page makes them, media.js)
async function outboxOpen(o) {
  if (S.plain.has(o.id)) return;
  const g = group(o.to);
  if (g) await decryptGroup(g, { id: o.id, from: S.me.id, body: o.meta.body, key: o.meta.keys[S.me.id] });
  else if (friend(o.to)) await decrypt(o.to, { id: o.id, from: S.me.id, to: o.to, ct: o.meta.ct });
}
let flushing = null, outRest = { n: 0, until: 0 };
async function outboxFlush(force) {
  if (!S.me || !S.outbox.length || flushing) return flushing;
  if (S.offline && !force && !navigator.onLine) return;
  flushing = (async () => {
    let sent = 0;
    for (const o of [...S.outbox]) {
      if (o.err && !force) continue;
      if (!S.outbox.some((x) => x.id === o.id)) continue;
      if (o.blob && !force && Date.now() < outRest.until) break;
      o.sending = true; emit("outbox", outView());
      try {
        if (o.blob) {
          const form = new FormData();
          form.append("meta", JSON.stringify(o.meta));
          form.append("photo", new Blob([o.blob], { type: "application/octet-stream" }), "photo.bin");
          await api(o.path, { method: "POST", form });
          outRest = { n: 0, until: 0 };
        } else await api(o.path, { method: "POST", body: o.meta });
        sent++;
      } catch (e) {
        o.sending = false;
        if (e.offline && o.blob) { outRest.n++; outRest.until = Date.now() + Math.min(10 * MIN, 15e3 * 2 ** outRest.n); }
        if (e.offline) break;
        if (!e.status || e.status >= 500 || e.status === 408 || e.status === 429) break;
        if (e.status !== 409 || !/already sent/.test(e.message)) { o.err = e.message; await outboxSave(); continue; }
      }
      outboxDrop(o.id); await outboxSave();
    }
    if (sent || S.outbox.some((o) => o.err)) { if (S.chat && S.view === "chat") await loadChat(S.chat).catch(() => {}); emitOpen(); emitLists(); }
    emit("outbox", outView());
  })();
  try { await flushing; } finally { flushing = null; }
}

/* ---------------- what crosses to the page (§5.5): views, never a key, a pin, a token or a ciphertext ---------------- */
const avatarOf = (p) => (p?.avatarAt ? `${p.id}:${p.avatarAt}` : null);
const readable = (id) => { const p = S.plain.get(id); return p && !p.bad && typeof p === "object" ? p : null; };
const partsOf = (p, inGroup) => { if (!p || p.bad || typeof p !== "object") return null; try { return payloadParts(p, { group: !!inGroup }); } catch (_) { return null; } };
const lineOf = (last, g) => {
  if (!last || last.flying && last.from !== S.me?.id) return "";
  const p = readable(last.id); if (!p) return "";
  const pp = partsOf(p, !!g), t = typeof (pp?.t ?? p.t) === "string" ? (pp?.t ?? p.t) : "";
  return (t || (p.p ? "Photo" : p.v ? "Voice pigeon" : pp?.card ? "A card" : "")).replace(/\s+/g, " ").slice(0, 120);
};
function rowList() {
  const rows = [
    ...S.friends.map((f) => ({ id: f.id, kind: "friend", name: String(f.name || ""), avatar: avatarOf(f), unread: Math.max(0, Number(f.unread) || 0),
      flying: (f.last?.flying ? 1 : 0), pinned: !!f.pinned, at: f.last ? (f.last.from === S.me?.id ? f.last.sentAt : f.last.deliverAt) || 0 : 0, keyChanged: !!f.keyChanged, _last: f.last, _g: null })),
    ...S.groups.map((g) => ({ id: g.id, kind: "group", name: String(g.name || ""), avatar: null, unread: Math.max(0, Number(g.unread) || 0),
      flying: (g.last?.flying ? 1 : 0), pinned: !!g.pinned, at: g.last ? (g.last.from === S.me?.id ? g.last.sentAt : g.last.deliverAt) || 0 : 0,
      keyChanged: others(g).some((p) => p.keyChanged), _last: g.last, _g: g })),
  ].sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at));
  const [from, to] = S.rowWin;
  return rows.map((r, i) => {
    const { _last, _g, ...row } = r;
    if (!S.locked && i >= from && i < to) row.line = lineOf(_last, _g);
    return row;
  });
}
const friendView = (f) => ({ id: f.id, handle: String(f.handle || ""), name: String(f.name || ""), avatar: avatarOf(f), online: isOnline(f), lastSeen: Number.isFinite(f.seenAt) ? f.seenAt : null,
  ...(typeof f.place === "string" && f.place ? { place: f.place } : {}), keyChanged: !!f.keyChanged, verified: isVerified(f), blocked: false });
const groupView = (g) => ({ id: g.id, name: String(g.name || ""), members: (g.members || []).map((p) => ({ id: p.id, name: String(p.name || "") })), muted: !!g.muted });
const reqView = (r, dir) => ({ id: r.id, handle: String(r.handle || ""), name: String(r.name || ""), at: Number(r.at || r.since || 0) || 0, dir });
const meView = () => (S.me ? { id: S.me.id, name: String(S.me.name || ""), handle: String(S.me.handle || ""), avatar: avatarOf(S.me), pigeons: pigeonsOn(),
  startAs: S.me.newChats === "instant" ? "instant" : "pigeon", death: !!S.me.risky, ...(typeof S.me.place === "string" && S.me.place ? { place: S.me.place } : {}), feathers: Number(S.feathers) || 0 } : null);
function airView() {
  const out = [], me = S.me?.id;
  for (const f of S.friends) { const m = f.last; if (m?.flying) out.push({ id: m.id, chatId: f.id, kind: kindOf(m), from: m.from === me ? "me" : first(f.name || "?"), to: m.from === me ? first(f.name || "?") : "me", landsAt: m.deliverAt || 0 }); }
  for (const g of S.groups) { const m = g.last; if (m?.flying) out.push({ id: m.id, chatId: g.id, kind: kindOf(m), from: m.from === me ? "me" : first(member(g, m.from)?.name || "?"), to: m.from === me ? String(g.name || "") : "me", landsAt: m.deliverAt || 0 }); }
  return out.sort((a, b) => a.landsAt - b.landsAt);
}
const outView = () => S.outbox.map((o) => ({ id: o.id, chatId: o.to, state: o.err ? "failed" : o.sending ? "sending" : "queued" }));
const keywarnView = () => ({ mine: !!S.keyBad, friends: [...S.friends.filter((f) => f.keyChanged).map((f) => f.id), ...new Set(S.groups.flatMap((g) => others(g).filter((p) => p.keyChanged).map((p) => p.id)))] });
const unreadNow = () => [...S.friends, ...S.groups].reduce((n, x) => n + Math.max(0, Number(x.unread) || 0), 0);
function msgView(chatId, m, g) {
  const me = S.me.id, mine = m.from === me, p = S.locked ? null : readable(m.id), pp = partsOf(p, !!g);
  const hidden = !mine && (m.flying || m.lost);                 // (theirs still in the air: not opened yet, nothing to read)
  const kind = !p || hidden ? "text" : p.v ? "voice" : p.p ? (m.once || p.p.once ? "viewonce" : "photo") : pp?.plan ? "plan" : pp?.ans ? "answer" : pp?.when ? "when" : pp?.ask ? "ask" : pp?.card ? "card" : "text";
  const reacts = (S.reacts.get(chatId) || []).filter((r) => r.msg === m.id), counts = {};
  let mineR;
  for (const r of reacts) { const e = readable(r.id)?.r; if (!REACTIONS.includes(e)) continue; counts[e] = (counts[e] || 0) + 1; if (r.from === me) mineR = e; }
  const v = { id: m.id, from: mine ? "me" : g ? m.from : "them", at: (mine ? m.sentAt : m.deliverAt) || m.sentAt || 0, kind,
    flight: { flying: !!m.flying, landsAt: Number.isFinite(m.deliverAt) ? m.deliverAt : null, lost: !!m.lost, waiting: !!m.waiting, way: m.instant ? "instant" : "pigeon", pigeon: m.instant ? null : kindOf(m) },
    reactions: counts, read: !!m.readAt, delivered: !!(m.delivered || m.gotAt || m.readAt || (!m.flying && !m.lost)), recalled: !!m.recalled };
  if (mineR) v.mine = mineR;
  if (p && !hidden) {
    const t = typeof (pp?.t ?? p.t) === "string" ? (pp?.t ?? p.t) : "";
    if (t) v.text = t;
    if (pp?.q?.id) v.replyTo = pp.q.id; else if (p.q?.id) v.replyTo = p.q.id;
    if (pp?.card) v.card = pp.card;
    if (p.p || p.v) v.media = { ref: m.id, kind: p.v ? "voice" : "photo", ...(p.v && Number.isFinite(p.v.d) ? { secs: Math.round(p.v.d / 100) / 10 } : {}) };
  } else if (S.plain.get(m.id)?.bad && !hidden) v.kind = "system";
  if (m.vanish && Number.isFinite(m.readAt)) v.expires = m.readAt + m.vanish;
  if (typeof m.postmark === "string") v.postmark = m.postmark;
  return v;
}
function chatView(id) {
  const g = group(id), list = [...(S.msgs.get(id) || [])];
  for (const o of S.outbox) if (o.to === id && !list.some((m) => m.id === o.id)) list.push({ id: o.id, from: S.me.id, sentAt: o.at, waiting: true, instant: !!o.meta?.instant, pigeon: o.kind });
  const n = S.win.get(id) || WIN, shown = list.slice(-n);
  return { id, kind: g ? "group" : "friend", msgs: S.locked ? [] : shown.map((m) => msgView(id, m, g)), older: list.length > shown.length };
}
function emitLists() {
  if (!ready()) return;
  emit("me", meView()); emit("rows", rowList()); emit("friends", S.friends.map(friendView)); emit("groups", S.groups.map(groupView));
  emit("requests", [...S.incoming.map((r) => reqView(r, "in")), ...S.outgoing.map((r) => reqView(r, "out"))]);
  emit("air", airView()); emit("outbox", outView()); emit("keywarn", keywarnView()); emit("unread", unreadNow());
}
function emitOpen() { if (S.view === "chat" && S.chat && !S.locked && ready()) emit("chat:" + S.chat, chatView(S.chat)); }
function emitTyping() {
  for (const id of new Set([...S.live.typingIn.keys(), ...(S.chat ? [S.chat] : [])])) if (id === S.chat && !S.locked) emit("typing:" + id, { on: S.live.typingIn.has(id) });
}
function emitKeywarn() { if (ready()) emit("keywarn", keywarnView()); }
// (locked, or the open chat let go: its words leave the page's store, risk I2)
function dropTopics(id) { if (!id) return; emit("chat:" + id, null); emit("typing:" + id, null); }

/* ---------------- keys and accounts: resume and forget (app.js 2716-2738, core half) ---------------- */
// (lockPrefs, as the engine read it before it answered anything: here, what the service read of inflight-lock, and
// locked until it's said otherwise, B4)
// (lockUid: the account Chat's kept lock is for; it holds only for that account, as lockPrefs's v.uid === S.me.id)
let lockAsked = true, lockUid = null;
const lockPrefs = () => lockAsked && (lockUid === null || S.me?.id === lockUid);
async function resume() {
  const saved = await idb.get("session");
  if (saved?.token && saved.priv) {
      S.token = saved.token; S.me = saved.me; S.priv = saved.priv; S.myPub = saved.pub || saved.me.pub;
      S.fp = await E2E.fingerprint(S.myPub);
      S.pins = (await idb.get("pins:" + saved.me.id)) || {};
      if (Object.keys(S.pins).length) await restorePins(); else S.pinsWait = restorePins().catch(() => {}).finally(() => { S.pinsWait = null; });
      if (lockPrefs()) S.locked = true;
    return true;
  }
  // (signed in to InFlite by the site's cookie, with Chat's key not on this phone yet: key; else signed out)
  const r = await api("resume", { method: "POST", body: {} }).catch(() => null);
  S.keyNeeded = !!r?.signedIn;
  return false;
}
async function forget(ended) {
  const me = S.me?.id;
  clearTimeout(cacheTimer); clearTimeout(draftsTimer); clearTimeout(pinsTimer);
  if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  clearTimeout(S.live.timer); clearTimeout(S.live.syncTimer); clearTimeout(hideTimer);
  gone();                                          // (from here every write is refused but these: S3-D4, risk I3)
  if (me) { await wipe("cache:" + me);
    if (!ended) { await wipe("outbox:" + me); await wipe("drafts:" + me); }
    if (await idb.get("pinsup:" + me).catch(() => null)) { await wipe("pins:" + me); await wipe("pinsup:" + me); } }
  await wipe("session");
  if (S.chat) dropTopics(S.chat);
  Object.assign(S, { token: null, me: null, priv: null, myPub: null, fp: "", friends: [], groups: [], incoming: [], outgoing: [], blocked: [], passkeys: [],
    msgs: new Map(), plain: new Map(), notes: new Map(), pairs: new Map(), pins: {}, pctx: new Map(), chatRaw: new Map(), outbox: [], drafts: new Map(),
    reacts: new Map(), view: "none", chat: null, raw: null, keyNeeded: false, pinsWait: null, keyBad: false, keyWarned: false });
}

/* ---------------- after 10 minutes hidden: every chat's words go but the list's (S3-D10) ---------------- */
let hideTimer = 0;
function hiddenNow() {
  clearTimeout(hideTimer);
  if (S.visible) return;
  hideTimer = unref(setTimeout(() => {
    const keep = new Set([...S.friends.map((f) => f.last?.id), ...S.groups.map((g) => g.last?.id)].filter(Boolean));
    for (const id of [...S.plain.keys()]) if (!keep.has(id)) { S.plain.delete(id); S.pctx.delete(id); }
    for (const fid of [...S.msgs.keys()]) if (fid !== S.chat) S.msgs.delete(fid);
    chatSigs.clear(); chatTags.clear();
    if (S.chat) { const id = S.chat; S.msgs.delete(id); dropTopics(id); }
  }, HIDDEN_DROP));
}
function lockNow(on) {
  const was = S.locked; S.locked = !!on;
  if (S.locked && !was) { if (S.chat) dropTopics(S.chat); emit("rows", ready() ? rowList() : []); }
  emitState();
  if (!S.locked && was && ready()) { emitLists(); emitOpen(); }
  ticking();
}

/* ---------------- sending: everything sealed here, every seal through trustedPub/base (risk 2) ---------------- */
const refuse = (why) => Object.assign(new Error(why), { why });
const trustErr = (e) => /security key changed|not in your friends/.test(e?.message || "");
const routeStyle = () => (S.me?.route === "safest" || S.me?.route === "scenic" ? S.me.route : "fastest");
const wayOf = (c) => (c?.way ?? S.me?.newChats ?? "pigeon") === "instant" ? "instant" : "pigeon";
const defaultNext = (c) => (pigeonsOn() && wayOf(c) === "pigeon" ? "pigeon" : "now");
// a chat's letter, sealed: one to one with base(to), a group once with its key wrapped for each (app.js send 10759)
async function sealFor(to, id, payload, { instant, kind, landAt }) {
  const g = group(to);
  if (g) {
    const { body, key, h } = await E2E.sealGroup({ id, from: S.me.id, group: g.id, type: "msg" }, padPayload({ ...payload }));
    const keys = {};
    for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
    return { path: "group-messages", meta: instant ? { id, group: g.id, body, keys, instant: true } : { id, group: g.id, body, keys, pigeon: kind } };
  }
  const ct = await E2E.seal(await base(to), { id, from: S.me.id, to, type: "msg" }, padPayload({ ...payload }));
  const route = routeStyle() === "fastest" ? {} : { route: routeStyle() };
  return { path: "messages", meta: instant ? { id, to, ct, instant: true, ...(landAt ? { landAt } : {}) } : { id, to, ct, pigeon: kind, ...route, ...(landAt ? { landAt } : {}) } };
}
async function sendOne(to, payload, { way, kind, at, blob = null, once = false, id: given = null } = {}) {
  if (!ready()) throw refuse(stateNow());
  if (S.locked) throw refuse("locked");
  const c = chatOf(to); if (!c) throw refuse("no");
  if (friend(to)?.keyChanged || (group(to) && others(group(to)).some((p) => p.keyChanged))) throw refuse("trust");
  const instant = way === "now" || way === "instant" ? true : way === "pigeon" ? false : defaultNext(c) === "now";
  const k = instant ? "instant" : Object.hasOwn(KIND, kind) ? kind : "standard";
  const id = given || uuid(), landAt = Number.isFinite(at) && at > now() ? Math.round(at) : null;
  let sealed;
  try { sealed = await sealFor(to, id, payload, { instant, kind: k, landAt }); } catch (e) { throw refuse(trustErr(e) ? "trust" : "failed"); }
  if (blob) sealed.meta.once = once;
  const queue = async () => { await outboxAdd({ id, to, path: sealed.path, meta: sealed.meta, blob, kind: k, at: Date.now() }); S.plain.set(id, payload); emitOpen(); emitLists(); return { id }; };
  if (S.offline && navigator.onLine === false) return queue();
  let r;
  try {
    if (blob) {
      const form = new FormData();
      form.append("meta", JSON.stringify(sealed.meta));
      form.append("photo", new Blob([blob], { type: "application/octet-stream" }), "photo.bin");
      r = await api(sealed.path, { method: "POST", form });
    } else r = await api(sealed.path, { method: "POST", body: sealed.meta });
  } catch (e) { if (e.offline) return queue(); throw refuse(e.why || "failed"); }
  S.plain.set(id, payload);
  if (r?.me) S.me = r.me; else if (PAID.includes(k) && S.me[k] > 0) S.me[k]--;
  const list = S.msgs.get(to) || [];
  if (r?.message && !list.some((x) => x.id === r.message.id)) list.push(r.message);
  S.msgs.set(to, list);
  emitOpen();
  sync().catch(() => {});
  return { id };
}
// One letter to one friend, with everything passed in (app.js sendLetter 11352; Send's, sendRun)
async function sendLetter(to, payload, { kind, landAt = null, id: again = null } = {}) {
  if (S.offline && navigator.onLine === false) throw Object.assign(new Error(NO_SIGNAL), { offline: true });
  const id = again || uuid(), route = routeStyle() === "fastest" ? {} : { route: routeStyle() }, instant = kind === "instant";
  const ct = await E2E.seal(await base(to), { id, from: S.me.id, to, type: "msg" }, padPayload({ ...payload }));
  const meta = instant ? { id, to, ct, instant: true, ...(landAt ? { landAt } : {}) } : { id, to, ct, pigeon: kind, ...route, ...(landAt ? { landAt } : {}) };
  let r;
  try { r = await api("messages", { method: "POST", body: meta }); }
  catch (e) {
    if (e.offline) throw Object.assign(new Error(NO_SIGNAL), { offline: true, unsure: true, id });
    if (again && e.status === 409 && /already sent/.test(e.message || "")) { S.plain.set(id, payload); return { id, message: null }; }
    throw e;
  }
  S.plain.set(id, payload);
  if (r.me) S.me = r.me; else if (PAID.includes(kind) && S.me[kind] > 0) S.me[kind]--;
  const list = S.msgs.get(to); if (list && r.message && !list.some((x) => x.id === r.message.id)) list.push(r.message);
  return r;
}
async function sendGroupLetter(g, payload, { id: again = null } = {}) {
  if (S.offline && navigator.onLine === false) throw Object.assign(new Error(NO_SIGNAL), { offline: true });
  const id = again || uuid();
  const { body, key, h } = await E2E.sealGroup({ id, from: S.me.id, group: g.id, type: "msg" }, padPayload({ ...payload }));
  const keys = {};
  for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
  let r;
  try { r = await api("group-messages", { method: "POST", body: { id, group: g.id, body, keys, instant: true } }); }
  catch (e) {
    if (e.offline) throw Object.assign(new Error(NO_SIGNAL), { offline: true, unsure: true, id });
    if (again && e.status === 409 && /already sent/.test(e.message || "")) { S.plain.set(id, payload); return { id, message: null }; }
    throw e;
  }
  S.plain.set(id, payload);
  const list = S.msgs.get(g.id); if (list && r.message && !list.some((x) => x.id === r.message.id)) list.push(r.message);
  return r;
}
/* ---------- Send to a Friend (app.js sendRows 11426, sendRun 11666; ../rank.js on first use) ---------- */
let rankMod = null;
const rankNow = async () => (rankMod ||= await import("../rank.js"));
const turnOf = (f) => { const ct = S.turns.get(f.id); return (ct && ct.at >= (S.raw?.now || 0) ? ct : f.turn) || {}; };
const chatKm = (f) => (S.me.lat != null && f.lat != null ? haversineKm(S.me.lat, S.me.lon, f.lat, f.lon) : 500);
const lofts = () => ({ swift: S.me?.swift || 0, turbo: S.me?.turbo || 0, rocket: S.me?.rocket || 0 });
const pickOf = (f, landAt) => ({ id: f.id, free: !!turnOf(f).free, waiting: S.outbox.some((o) => o.to === f.id && o.kind === "standard" && !o.err), landAt: landAt ?? null });
const moonChat = (f) => !!f && !!(S.me?.moon || f.moon);
const streakOf = (f) => (pigeonsOn() && f?.streak && f.streak.n >= 3 ? f.streak : null);
const streakRisk = (s) => s && !s.today && s.endsAt - now() < 6 * HOUR;
const sendInstant = (s) => !pigeonsOn() || s.when === "now";
const noRef = (c) => { if (!c || c.kind !== "fitness" || !c.ref) return c; const { ref, ...rest } = c; return rest; };
function landFor(s, f) {
  if (s.when === "asap" || s.when === "now") return null;
  if (sendInstant(s)) {
    if (s.when !== "morning" || !f.tz) return null;
    try { const at = nextLocal(f.tz, "07:30", now() + 60e3); return Number.isFinite(at) && at <= now() + 30 * DAY ? Math.round(at) : null; } catch (_) { return null; }
  }
  const t = now(), fly = flightMs(chatKm(f), mySpeed("swift"));
  let at = null;
  try { if (s.when === "morning") at = nextLocal(f.tz || MY_TZ, "07:30", t + fly + MARGIN_MS); } catch (_) { at = null; }
  return Number.isFinite(at) && at > t + fly && at <= t + 30 * DAY ? Math.round(at) : null;
}
function digestMsg(m, inGroup) {
  const p = S.plain.get(m.id); if (!p || p.bad) return null;
  const pp = partsOf(p, inGroup);
  return { text: typeof (pp?.t ?? p.t) === "string" ? (pp?.t ?? p.t) : "", card: pp?.card || null, plan: pp?.plan || null, when: pp?.when || null, ask: pp?.ask || null, ans: pp?.ans || null, at: m.deliverAt };
}
function sendRows(s, R) {
  const t = now(), card = s.card, pool = S.friends, inst = sendInstant(s);
  const onlyFor = card?.there === true ? `Only for ${first(friend(card.ref?.friend)?.name || "the friend it’s about")}` : null;
  const forThem = (id) => { try { return canForward(card, { mine: true, to: id }); } catch (_) { return false; } };
  const why0 = (f) => (onlyFor && !forThem(f.id) ? onlyFor : f.keyChanged ? "Check the new safety number first" : inst ? null : f.lat == null && !f.moon ? "No location yet" : moonChat(f) ? "Send from the chat" : null);
  const kinds = (() => { const picks = pool.filter((f) => s.pick.includes(f.id)); try { return pigeonsFor(picks.map((f) => pickOf(f, landFor(s, f))), { me: lofts(), now: t }) || new Map(); } catch (_) { return new Map(); } })();
  const kf = (f) => (inst ? "instant" : kinds.get(f.id) || (() => { try { return pigeonsFor([pickOf(f, landFor(s, f))], { me: lofts(), now: t }).get(f.id) || null; } catch (_) { return null; } })());
  const canFly = (f) => why0(f) || (inst || kf(f) ? null : "No pigeon free just now");
  const landsIn = (f) => flightMs(chatKm(f), mySpeed(kf(f) && kf(f) !== "instant" ? kf(f) : "swift"));
  let rows = [];
  try { rows = R.rankFriends(card, { friends: pool, me: { lat: S.me.lat, lon: S.me.lon, tz: MY_TZ }, now: t, rain: {}, seen: s.seen || new Map(), landsIn: inst ? () => null : landsIn,
    asked: [], planned: [], calls: S.times || [], streakRisk: !pigeonsOn() ? undefined : (f) => { const st = streakOf(f); return st && streakRisk(st) ? { n: st.n, endsAt: st.endsAt } : null; },
    lastAt: (f) => (f.last ? (f.last.from === S.me.id ? f.last.sentAt : f.last.deliverAt) : null), canFly }) || []; } catch (_) {}
  if (!rows.length) rows = pool.map((f) => ({ id: f.id, score: 0, reason: "", best: false }));
  rows = rows.filter((r) => friend(r.id)).map((r) => { const f = friend(r.id); return { ...r, can: !canFly(f), why: canFly(f), kind: inst ? "instant" : kf(f), lands: inst ? null : Number.isFinite(r.lands) ? r.lands : landsIn(f) }; });
  const gWhy = (g) => (onlyFor ? onlyFor : !inst ? "For a group, only Now" : others(g).some((p) => p.keyChanged) ? "Check a new safety number first" : null);
  const gRows = S.groups.map((g) => ({ id: g.id, group: true, score: 0, reason: `Group of ${g.members.length}`, best: false, can: !gWhy(g), why: gWhy(g), kind: "instant", lands: null }));
  return [...rows.filter((r) => r.can), ...gRows.filter((r) => r.can), ...rows.filter((r) => !r.can), ...gRows.filter((r) => !r.can)];
}
// the rows as the page has them: a Row each, with whether it can be picked and why not (never a key)
const shareRow = (r) => {
  const f = friend(r.id), g = group(r.id), row = rowList().find((x) => x.id === r.id) || { id: r.id, kind: g ? "group" : "friend", name: String((f || g)?.name || ""), avatar: avatarOf(f), unread: 0, flying: 0, pinned: false, at: 0, keyChanged: !!f?.keyChanged };
  const { line, ...bare } = row; void line;
  return { ...bare, can: !!r.can, why: r.why || null, reason: String(r.reason || ""), best: !!r.best, way: r.kind || null, lands: Number.isFinite(r.lands) ? r.lands : null };
};
const cardOf = (c) => { let x = null; try { x = normCard(c, { from: "hash" }); } catch (_) {} return x; };
function sendSpec(card, words, o = {}) {
  return { card, base: String(words || card.say || cardWords(card) || "").trim().slice(0, 500), words: "", edited: false, pick: [...new Set(o.pick || [])], when: ["now", "asap", "morning"].includes(o.when) ? o.when : "now",
    ask: !!o.ask, plan: false, rain: null, seen: new Map(), busy: false, err: "" };
}
function wordsFor(s, f, landAt, ask = true) {
  let t = s.base;
  if (f && landAt && s.when !== "asap") try { t = landWords(s.card, { mode: s.when, landAt, rainAt: null, tz: f.tz || MY_TZ }) || t; } catch (_) {}
  t = String(t || "").trim() || s.card.say || cardWords(s.card) || "";
  if (ask && s.ask && ASK_KINDS.includes(s.card.kind)) { try { t = askWords(t.slice(0, 486)); } catch (_) {} }
  return t.slice(0, 500);
}
async function shareRef(card) {
  if (card?.kind !== "fitness" || !card.snap) return { card: noRef(card), id: null };
  const sn = card.snap || {};
  try {
    const r = await api("fit-share", { method: "POST", body: { day: sn.day, tz: sn.tz || MY_TZ, sport: sn.sport } });
    if (typeof r.id === "string" && /^[A-Za-z0-9_-]{22}$/.test(r.id)) return { card: { ...card, ref: { share: r.id } }, id: r.id };
  } catch (_) {}
  return { card: noRef(card), id: null };
}
const dropRef = (id) => { if (id) api("fit-share", { method: "POST", body: { drop: id } }).catch(() => {}); };
// one letter at a time, in the order shown, each with the pigeon free for it by then; a group as a message to everyone
async function sendRun(s, R) {
  if (S.offline && navigator.onLine === false) return { ok: false, why: "offline", sent: [], failed: [...s.pick] };
  const inst = sendInstant(s);
  const order = sendRows(s, R).filter((r) => r.can).map((r) => r.id).filter((id) => s.pick.includes(id)).map(chatOf).filter(Boolean);
  const notThese = s.pick.filter((id) => !order.some((x) => x.id === id));
  const results = [], failed = [...notThese], sent = [];
  const sr = await shareRef(s.card), card = sr.card;
  let off = false, okRef = false;
  for (let i = 0; i < order.length; i++) {
    const f = order[i], g = group(f.id), name = g ? g.name : first(f.name);
    emit("send", { id: f.id, step: "sealing" });
    if (off) { failed.push(f.id); results.push({ name, ok: false, err: NO_SIGNAL }); emit("send", { id: f.id, step: "failed", why: "offline" }); continue; }
    try {
      if (g) await sendGroupLetter(g, buildPayload({ t: wordsFor(s, null, null, false), card: noRef(card), group: true }));
      else {
        const rest = order.slice(i).filter((x) => !group(x.id)), landAt = landFor(s, f);
        let kind = inst ? "instant" : null;
        if (!kind) try { kind = pigeonsFor(rest.map((x) => pickOf(x, landFor(s, x))), { me: lofts(), now: now() }).get(f.id) || null; } catch (_) {}
        if (!kind) throw Object.assign(new Error("No pigeon free just now."), { why: "failed" });
        await sendLetter(f.id, buildPayload({ t: wordsFor(s, f, landAt), card, to: f.id, ...(s.ask && ASK_KINDS.includes(card.kind) ? { ask: { kind: card.kind } } : {}) }), { kind, landAt });
        okRef = true;
      }
      sent.push(f.id); results.push({ name, ok: true, landAt: null, lands: null });
      emit("send", { id: f.id, step: "sent" });
    } catch (e) {
      const why = e.offline ? "offline" : trustErr(e) ? "trust" : "failed";
      if (e.offline) off = true;
      failed.push(f.id); results.push({ name, ok: false, err: e.message || "Couldn’t send it." });
      emit("send", { id: f.id, step: "failed", why });
    }
  }
  if (!okRef) dropRef(sr.id);
  let say = "";
  try { say = sent.length ? (inst ? sentToast(results, { instant: true }) : sentToast(results)) || "" : ""; } catch (_) {}
  if (sent.length) sync().catch(() => {});
  emit("outbox", outView());
  const out = { ok: sent.length > 0 && !failed.length, sent, failed };
  if (say) out.say = say;
  if (failed.length) out.why = off ? "offline" : notThese.length && !sent.length ? "trust" : "failed";
  return out;
}

/* ---------- what's waiting for you, for Today (app.js 12198-12228): quiet=1, nothing marked read, nothing kept ---------- */
async function waitingItem(id, after = -Infinity) {
  const f = friend(id), g = !f && group(id); if (!f && !g) return null;
  const d = await api(f ? `messages?with=${encodeURIComponent(id)}&quiet=1` : `group-messages?id=${encodeURIComponent(id)}&quiet=1`);
  const list = Array.isArray(d.messages) ? d.messages : [];
  let i = list.length - 1; while (i >= 0 && list[i].from !== S.me.id) i--;
  const theirs = list.slice(i + 1).filter((m) => m.from !== S.me.id && !m.flying && !m.lost && !m.waiting && (m.deliverAt || 0) >= after).slice(-5);
  if (!theirs.length) return null;
  // (opened into a store of their own, never the chat's: what's read for Today isn't kept, S3-D6)
  const msgs = [];
  for (const m of theirs) {
    const had = S.plain.has(m.id);
    try { if (g) await decryptGroup(g, m); else await decrypt(id, m); } catch (_) {}
    const x = digestMsg(m, !!g); if (x) msgs.push(x);
    if (!had && !(S.msgs.get(id) || []).some((y) => y.id === m.id) && friend(id)?.last?.id !== m.id && group(id)?.last?.id !== m.id) { S.plain.delete(m.id); S.pctx.delete(m.id); }
  }
  return msgs.length ? { id, first: g ? g.name : first(f.name), at: theirs.at(-1).deliverAt, msgs } : null;
}
async function waiting({ ids, stocks } = {}) {
  if (stateNow() !== "ready") return [];
  if (Array.isArray(stocks)) S.stocks = stocks.filter((x) => x && typeof x === "object" && (typeof x.sym === "string" || typeof x.name === "string"))
    .slice(0, 50).map((x) => ({ sym: typeof x.sym === "string" ? x.sym.slice(0, 12) : undefined, name: typeof x.name === "string" ? x.name.slice(0, 60) : undefined }));
  const want = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && x.length <= 64))].slice(0, 6), items = [];
  for (const id of want) { try { const it = await waitingItem(id); if (it) items.push(it); } catch (_) {} }
  try { return waitingDigest(items, { stocks: S.stocks || [], now: Date.now() }); } catch (_) { return []; }
}
async function since(id, t) {
  if (stateNow() !== "ready" || typeof id !== "string" || !Number.isFinite(t)) return null;
  try {
    const it = await waitingItem(id, t); if (!it) return null;
    const d = waitingDigest([it], { stocks: S.stocks || [], now: Date.now() })[0];
    return d ? { said: d.said, at: d.at } : null;
  } catch (_) { return null; }
}
/* ---------- search inside chats (app.js searchMessages 7040): on this phone only, newest 8 ---------- */
async function search(q) {
  if (stateNow() !== "ready") return [];
  const term = fold(q.trim());
  if (term.length < 2) return [];
  for (const [fid, d] of S.chatRaw) if (!S.msgs.has(fid) && (friend(fid) || group(fid))) await applyChat(fid, d, false).catch(() => {});
  const hits = [], seen = new Set();
  const look = (chat, m) => {
    if (!m || seen.has(m.id)) return; seen.add(m.id);
    const p = S.plain.get(m.id); if (!p || p.bad || typeof p.t !== "string" || !p.t) return;
    const at = fold(p.t).indexOf(term); if (at < 0) return;
    hits.push({ chat, m, p, when: m.from === S.me.id ? m.sentAt : m.deliverAt });
  };
  for (const [chat, list] of S.msgs) for (const m of list) look(chat, m);
  for (const f of S.friends) look(f.id, f.last);
  for (const g of S.groups) look(g.id, g.last);
  hits.sort((a, b) => b.when - a.when);
  return hits.slice(0, 8).map(({ chat, m, p, when }) => {
    const g = group(chat), f = friend(chat), t = p.t.replace(/\s+/g, " "), at = fold(t).indexOf(term), a = Math.max(0, at - 28), b = Math.min(t.length, at + term.length + 60);
    const by = m.from === S.me.id ? "You: " : g ? `${first(member(g, m.from)?.name || "Someone")}: ` : "";
    return { token: m.id, chatId: chat, title: g ? String(g.name || "") : first(f?.name || "Someone"), sub: `${by}${a ? "…" : ""}${t.slice(a, b)}${b < t.length ? "…" : ""}`, at: when || 0 };
  });
}
/* ---------- a photo or a voice pigeon, opened: a Blob for the page (object URLs are the page's) ---------- */
async function photo(id) {
  if (stateNow() !== "ready") return null;
  // (only the chat the page has open: never another chat's photo or voice, S3-D3)
  const chat = S.view === "chat" ? S.chat : null; if (!chat) return null;
  const m = (S.msgs.get(chat) || []).find((y) => y.id === id) || null;
  const p = readable(id), o = S.outbox.find((x) => x.id === id && x.to === chat);
  if (!m && !o) return null;
  if (!p || !(p.p || p.v)) return null;
  const type = p.v ? (typeof p.v.m === "string" && /^audio\/[\w.+-]+$/.test(p.v.m) ? p.v.m : "audio/mp4") : p.p.m === "image/gif" ? "image/gif" : "image/jpeg";
  try {
    let bytes;
    if (o?.blob) bytes = o.blob;
    else {
      if (!m || (m.from !== S.me.id && (m.flying || m.lost))) return null;
      const r = await api((group(chat) ? "group-photo/" : "photo/") + encodeURIComponent(m.id), { raw: true });
      bytes = await r.arrayBuffer();
    }
    const plain = p.v ? await E2E.openPhoto(id, p.v, bytes, "voice") : await E2E.openPhoto(id, p.p, bytes);
    return new Blob([plain], { type });
  } catch (_) { return null; }
}

/* ---------------- the methods (RPC above): each refuses with a WHY word ---------------- */
const needReady = () => { const st = stateNow(); if (st !== "ready") throw refuse(st); };
const isPlain = (o) => !!o && typeof o === "object" && !Array.isArray(o) && [Object.prototype, null].includes(Object.getPrototypeOf(o));
let starting = null;
const methods = {
  hello: () => ({ protocol: PROTOCOL }),
  async start(o = {}) {
    if (typeof o.locked === "boolean") lockAsked = o.locked;
    if (typeof o.lockUid === "string") lockUid = o.lockUid;
    if (typeof o.visible === "boolean") { S.visible = o.visible; hiddenNow(); }
    if (typeof o.screen === "boolean") { S.screen = o.screen; if (o.screen) S.shown = true; if (o.screen && S.view !== "chat") S.view = "messages"; if (!o.screen && S.view === "messages") S.view = "none"; }
    if (!started) {
      started = true;
      // (locked from the first call, B4: only start({ locked: false }) or lock(false) opens it; a lock kept for another
      // account is that account's: resume's lockPrefs line decides, once it knows who's here)
      S.locked = lockAsked && lockUid === null;
      starting = (async () => {
        const have = await resume().catch(() => false);
        if (have && S.token) {
          // (no pins on this phone yet: nothing is opened, nor any key pinned, from a kept copy before the server's
          // pins have answered: the first sync waits for them, B3)
          if (!S.pinsWait) await cacheLoad();
          await outboxLoad();
          await draftsLoad();
          emitState(); emitLists();
          await sync();
        }
        emitState();
      })();
      await starting;
    } else {
      await starting;
      if (typeof o.locked === "boolean") lockNow(lockPrefs());
      if (ready() && (o.visible || o.screen)) {
        // (back after 10 minutes away: the open chat's words were let go of, so it's opened again from the server)
        if (S.chat && S.view === "chat" && !S.msgs.has(S.chat) && !S.locked) await loadChat(S.chat).catch(() => {});
        if (S.chat) markRead(S.chat, S.msgs.get(S.chat) || []);
        emitLists(); emitOpen(); if (onScreen()) sync().catch(() => {});
      }
    }
    ticking();
    return { state: emitState() };
  },
  state: () => ({ state: stateNow() }),
  lock(on) { lockAsked = on; lockNow(on); return { state: stateNow() }; },
  async signOut() {
    try { if (S.token) await api("logout", { method: "POST" }).catch(() => {}); } catch (_) {}
    await forget(true).catch(() => {});
    lastState = null; emitState();
    return { ok: true };
  },
  async forget() { await forget(true).catch(() => {}); lastState = null; emitState(); return { ok: true }; },
  async sync(o = {}) {
    if (!ready()) return { ok: false };
    S.live.forceChat = true;
    const before = S.lastSync;
    await sync(o.quiet === true || !onScreen());
    return { ok: S.lastSync > before };
  },
  async open(id) {
    needReady();
    if (!chatOf(id)) throw refuse("no");
    if (S.chat && S.chat !== id) dropTopics(S.chat);
    S.view = "chat"; S.chat = id;
    if (!S.msgs.has(id) && S.chatRaw.has(id)) await applyChat(id, S.chatRaw.get(id), false).catch(() => {});
    const fresh = loadChat(id).then(() => { markRead(id, S.msgs.get(id) || []); emitOpen(); emitLists(); }, () => {});
    if (!S.msgs.has(id)) await fresh;
    emitTyping();
    ticking();
    return chatView(id);
  },
  leave() {
    if (S.chat) { const id = S.chat; S.chat = null; dropTopics(id); }
    S.view = S.screen ? "messages" : "none";
    draftsSoon();
    return { ok: true };
  },
  older(id, before) {
    needReady();
    if (id !== S.chat) throw refuse("no");
    const list = S.msgs.get(id) || [], n = S.win.get(id) || WIN;
    const at = list.findIndex((m) => ((m.from === S.me.id ? m.sentAt : m.deliverAt) || 0) >= before), upTo = at < 0 ? list.length : at;
    const want = Math.min(list.length, Math.max(n, list.length - upTo + WIN));
    S.win.set(id, want);
    emitOpen();
    return { added: want - Math.min(n, list.length), older: list.length > want };
  },
  rows(from, to) {
    if (to < from || to - from > 40) throw refuse("no");
    S.rowWin = [from, to];
    return ready() ? rowList().slice(from, to) : [];
  },
  search: (q) => search(q),
  waiting: (o = {}) => waiting(o),
  since: (id, t) => since(id, t),
  photo: (id) => photo(id),
  async sendText(id, text, o = {}) {
    needReady();
    const t = text.trim(); if (!t) throw refuse("no");
    const payload = { t };
    if (o.replyTo) { const p = readable(o.replyTo), m = (S.msgs.get(id) || []).find((x) => x.id === o.replyTo); if (p && m) payload.q = { id: m.id, from: m.from, t: String(p.t || "").slice(0, 200), ...(p.p ? { p: 1 } : {}) }; }
    const r = await sendOne(id, payload, { way: o.way, kind: o.kind, at: o.at });
    S.drafts.delete(id); S.draftsTouched.add(id); draftsSoon();
    return r;
  },
  async sendBlob(id, blob, kind) {
    needReady();
    const bytes = new Uint8Array(await blob.arrayBuffer()), mid = uuid();
    const sealed = await E2E.sealPhoto(mid, bytes, kind === "voice" ? "voice" : "photo");
    const payload = { t: "" };
    if (kind === "voice") payload.v = { k: sealed.k, iv: sealed.iv, m: /^audio\/[\w.+-]+$/.test(blob.type) ? blob.type : "audio/mp4", d: 0, w: [] };
    else {
      let w = 0, h = 0;
      try { const b = await createImageBitmap(blob); w = b.width; h = b.height; b.close?.(); } catch (_) {}
      payload.p = { k: sealed.k, iv: sealed.iv, w, h, ...(blob.type === "image/gif" ? { m: "image/gif" } : {}) };
    }
    return sendOne(id, payload, { blob: sealed.data, once: kind === "photo" && blob.type !== "image/gif", id: mid });
  },
  async note(id, msgId, text) {
    needReady();
    const m = (S.msgs.get(id) || []).find((x) => x.id === msgId), to = m && friend(m.finalTo);
    if (!m || !to || !text.trim()) throw refuse("no");
    let ct;
    try { ct = await E2E.seal(await pairFor(trustedPub(to)), { id: m.id + ":via", from: S.me.id, to: to.id, type: "note" }, { t: text.trim().slice(0, 200) }); } catch (_) { throw refuse("trust"); }
    try { await api("stopover-note", { method: "POST", body: { id: m.id, ct } }); } catch (e) { throw refuse(e.offline ? "offline" : "failed"); }
    S.notes.set(m.id, text.trim()); m.mine = "sent"; emitOpen();
    return { ok: true };
  },
  async react(id, msgId, e) {
    needReady();
    if (!REACTIONS.includes(e)) throw refuse("no");
    const g = group(id), list = S.reacts.get(id) || [], mineNow = list.find((r) => r.msg === msgId && r.from === S.me.id);
    const m = (S.msgs.get(id) || []).find((x) => x.id === msgId); if (!m) throw refuse("no");
    try {
      if (mineNow && readable(mineNow.id)?.r === e) {
        await api("react", { method: "DELETE", body: { msg: msgId } });
        S.reacts.set(id, list.filter((r) => r !== mineNow)); emitOpen(); return { ok: true };
      }
      const rid = uuid(), payload = { r: e, m: msgId };
      let body;
      if (g) {
        const { body: sealed, key, h } = await E2E.sealGroup({ id: rid, from: S.me.id, group: g.id, type: "react" }, payload);
        const keys = {};
        for (const p of [{ id: S.me.id, pub: S.myPub || S.me.pub }, ...others(g)]) keys[p.id] = await E2E.seal(await pairFor(p.id === S.me.id ? p.pub : trustedPub(p)), { id: rid, from: S.me.id, to: p.id, type: "wrap" }, { k: key, h });
        body = { id: rid, msg: msgId, group: true, body: sealed, keys };
      } else {
        const to = m.from === S.me.id ? m.to : m.from;
        body = { id: rid, msg: msgId, ct: await E2E.seal(await base(id), { id: rid, from: S.me.id, to, type: "react" }, payload) };
      }
      const r = await api("react", { method: "POST", body });
      S.plain.set(rid, payload);
      S.reacts.set(id, [...list.filter((x) => x !== mineNow), r.react]);
      emitOpen();
      return { ok: true };
    } catch (err) { throw refuse(err.why || (trustErr(err) ? "trust" : err.offline ? "offline" : "failed")); }
  },
  async recall(id, msgId) {
    needReady();
    const g = group(id), list = S.msgs.get(id) || [], i = list.findIndex((x) => x.id === msgId);
    if (i < 0 || list[i].from !== S.me.id) throw refuse("no");
    let r;
    try { r = await api(g ? "group-recall" : "recall", { method: "POST", body: { id: msgId } }); } catch (e) { throw refuse(e.offline ? "offline" : "failed"); }
    if (r.cancelled) { list.splice(i, 1); S.plain.delete(msgId); }
    else { list[i] = r.message; if (r.message?.recalled && !(r.message.flock || []).some((x) => !x.flying && !x.lost)) S.plain.delete(msgId); }
    if (r.me) S.me = r.me;
    emitOpen(); sync().catch(() => {});
    return { ok: true };
  },
  read(id) {
    needReady();
    if (!(S.view === "chat" && S.chat === id && onScreen())) throw refuse("no");
    markRead(id, S.msgs.get(id) || []);
    emitLists();
    return { ok: true };
  },
  draft(id, text) {
    needReady();
    if (!chatOf(id)) throw refuse("no");
    if (text.trim()) S.drafts.set(id, text); else S.drafts.delete(id);
    S.draftsTouched.add(id);
    if (id === S.chat) { S.live.keyAt = Date.now(); if (typingSay(id)) { S.live.quietSince = Date.now(); pulseNow(); } }
    draftsSoon();
    return { ok: true };
  },
  async share(c, words) {
    needReady();
    const card = cardOf(c); if (!card) throw refuse("card");
    const R = await rankNow();
    return sendRows(sendSpec(card, words), R).map(shareRow);
  },
  async rank(c) {
    needReady();
    const card = cardOf(c); if (!card) throw refuse("card");
    const R = await rankNow(), out = {};
    for (const r of sendRows(sendSpec(card, ""), R)) out[r.id] = { why: String(r.why || r.reason || ""), score: Number(r.score) || 0 };
    return out;
  },
  async sendRun(o) {
    needReady();
    const card = cardOf(o.card); if (!card) throw refuse("card");
    if (o.plan) throw refuse("no");                // (a plan to ride is Fitness's, sent from Chat's own page for now)
    const R = await rankNow();
    return sendRun(sendSpec(card, o.words, o), R);
  },
  async safety(id) {
    needReady();
    const p = friend(id) || S.groups.map((g) => member(g, id)).find((x) => x && x.id !== S.me.id);
    if (!p?.pub || !S.myPub) throw refuse("no");
    const digits = await E2E.safety(S.me.id, S.myPub, p.id, p.pub);
    return { digits: digits.join(""), verified: isVerified(p), keyChanged: !!p.keyChanged };
  },
  verify(id, on) {
    needReady();
    const p = friend(id); if (!p?.pub) throw refuse("no");
    if (on && p.keyChanged) throw refuse("trust");  // (a changed key is trusted first, with trust(id), never by a tick)
    setVerified(p, on);
    emit("friends", S.friends.map(friendView)); emitKeywarn();
    return { ok: true };
  },
  async trust(id) {
    needReady();
    if (!personById(id)) throw refuse("no");
    await trustNewKey(id);
    emit("friends", S.friends.map(friendView)); emitKeywarn(); emit("rows", rowList());
    return { ok: true };
  },
  async meta(name, args) {
    needReady();
    // (args.method: one of the entry's methods; none given, GET where it has one, else its only one)
    const e = META[name], ms = Object.keys(e.methods), method = typeof args.method === "string" ? args.method.toUpperCase() : ms.includes("GET") ? "GET" : ms[0], rule = Object.hasOwn(e.methods, method) ? e.methods[method] : null;
    if (!rule) throw refuse("no");
    const q = [], body = {};
    let path = e.path;
    for (const [k, v] of Object.entries(args)) {
      if (k === "method") continue;
      if (path.includes(`<${k}>`)) { if (!ARGS.id(v)) throw refuse("no"); path = path.replace(`<${k}>`, encodeURIComponent(v)); continue; }
      if (rule.q.includes(k)) { if (!["string", "number", "boolean"].includes(typeof v) || String(v).length > 200) throw refuse("no"); q.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`); continue; }
      if (rule.b.includes(k)) { body[k] = v; continue; }
      throw refuse("no");
    }
    if (/<\w+>/.test(path)) throw refuse("no");
    if (JSON.stringify(body).length > 8000) throw refuse("no");
    let r;
    try { r = await api(path + (q.length ? "?" + q.join("&") : ""), { method, ...(method === "GET" ? {} : { body }), raw: !!e.blob }); }
    catch (err) { throw refuse(err.offline ? "offline" : err.why || "failed"); }
    if (e.blob) return r.blob();
    if (r?.me && typeof r.me === "object" && r.me.id === S.me?.id) { S.me = { ...S.me, ...r.me }; emit("me", meView()); }
    if (method !== "GET" && /^(friends|friends-respond|block|groups|group-)/.test(name)) sync().catch(() => {});
    return clean(r);
  },
};
const personById = (id) => friend(id) || S.groups.map((g) => member(g, id)).find((p) => p && p.id !== S.me.id) || null;
// (a META answer, with no key the page mustn't have: tokens, keys, ciphertext; a nested one too)
const NEVER = new Set(["d", "kty", "token", "ct", "iv", "priv", "pins", "vault", "keys", "body", "key"]);
function clean(v, depth = 0) {
  if (depth > 8 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) if (!NEVER.has(k)) out[k] = clean(x, depth + 1);
  return out;
}

/* ---------------- arguments: every one checked, as the header's rules say ---------------- */
const str = (n) => (v) => typeof v === "string" && v.length <= n;
const ARGS = {
  id: (v) => typeof v === "string" && /^[\w-]{1,64}$/.test(v),
  ids: (v) => Array.isArray(v) && v.length <= 50 && v.every((x) => ARGS.id(x)),
  text: str(4000), q: str(100), emoji: str(16), words: str(500),
  int: (v) => Number.isInteger(v) && v >= 0, num: (v) => Number.isFinite(v), bool: (v) => typeof v === "boolean", t: (v) => Number.isFinite(v) && v >= 0,
  blob: (v) => typeof Blob !== "undefined" && v instanceof Blob && v.size <= 25 * 1024 * 1024,
  card: (v) => isPlain(v) && JSON.stringify(v).length <= 8000,
  name: (v) => typeof v === "string" && Object.hasOwn(META, v),
  obj: (v) => isPlain(v) && Object.keys(v).length <= 30,
  media: (v) => v === "photo" || v === "voice",
  stocks: (v) => Array.isArray(v) && v.length <= 50 && v.every((x) => isPlain(x) && Object.keys(x).every((k) => (k === "sym" && str(12)(x.sym)) || (k === "name" && str(60)(x.name)))),
};
function argOk(rule, v) {
  if (typeof rule === "string") {
    const opt = rule.endsWith("?"), r = opt ? rule.slice(0, -1) : rule;
    if (v === undefined) return opt;
    const m = /^str:(\d+)$/.exec(r);
    return m ? str(+m[1])(v) : !!ARGS[r]?.(v);
  }
  // an object rule: may be left out (as {}), only these keys, each keeping its rule
  if (v === undefined) return true;
  if (!isPlain(v)) return false;
  for (const k of Object.keys(v)) if (!Object.hasOwn(rule, k)) return false;
  return Object.entries(rule).every(([k, r]) => argOk(r, v[k]));
}
export function argsOk(m, a) {
  const spec = Object.hasOwn(RPC, m) ? RPC[m] : null;
  if (!spec || !Array.isArray(a) || a.length > spec.args.length) return false;
  return spec.args.every((r, i) => argOk(r, a[i]));
}
// The one door in: a method of RPC with arguments that keep its rules, else { why: "no" }; after forget(), only
// hello and state answer
export async function handle(d) {
  if (!d || typeof d !== "object" || !Number.isInteger(d.id)) return null;
  const { id, m } = d, a = Array.isArray(d.a) ? d.a : d.a === undefined ? [] : null;
  if (typeof m !== "string" || !Object.hasOwn(methods, m) || !argsOk(m, a)) return { id, ok: false, why: "no" };
  if (isGone() && !["hello", "state"].includes(m)) return { id, ok: false, why: "no" };
  if (m !== "hello" && m !== "start" && !started) return { id, ok: false, why: "no" };
  // (nothing answers while the first start is still finding out who's here and whether they're locked: B4)
  if (starting && m !== "hello" && m !== "start") await starting.catch(() => {});
  try { return { id, ok: true, v: await methods[m](...a) }; }
  catch (e) { return { id, ok: false, why: WHY.includes(e?.why) ? e.why : e?.offline ? "offline" : "failed" }; }
}
if (typeof self !== "undefined" && typeof self.postMessage === "function" && typeof self.addEventListener === "function") {
  self.addEventListener("message", (e) => { handle(e.data).then((r) => { if (r) post(r); }); });
}
