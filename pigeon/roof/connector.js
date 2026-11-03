// Chats' connector (One roof, stage 3: roof/s3/spec.md §5.3; s24-contracts §5, §8): what Chats shares with InFlite, read
// by the framework without loading the module. No imports, ≤ 4096 bytes. Frozen by B0 (shares' words, sections,
// aliases, the shape); UI-A keeps files exact as the graphs change (roofcontract checks):
//   files   = the static graph of chats.js + service.js + the core's static graph (core.js) + REGISTRY's CSS
//   lazy    = the closure of every literal fw.lazy import (and the core's one import("../rank.js")), less files, less the
//             network-only files (flight.js, scan.js, geodata, jsqr.js) and crypto.js's Argon2
//   preload = only the entry and this file (the rest is fetched under stamped URLs, S3-D1, risk I12)
//   mini(answer) → { kind: "num", num, label: "Unread" } from Today's chat card (answer.cards.chat.unread), or null.
// No search here: the Chats search is the frame's own provider over the core (§2.4).
export const CONNECTOR = 1;
export const connector = {
  app: "chats",
  name: "Chats",
  shares: {
    cards: "Who’s waiting for you, and letters on their way",
    search: "Your friends and your messages, on this phone only",
    notifications: "New messages and letters as they land, never their words",
    actions: "Open a chat; send a card to a friend",
    screens: "Chats · Friends",
  },
  sections: [["chats", "Chats"], ["friends", "Friends"]],
  aliases: { open: "chats", settings: "chats", account: "chats", flightlog: "chats", share: "chats", requests: "friends", add: "friends" },
  files: [
    "/chats/roof/chats.js",
    "/chats/roof/connector.js",
    "/chats/roof/store.js",
    "/chats/roof/list.js",
    "/chats/roof/friends.js",
    "/chats/roof/chat.js",
    "/chats/roof/lock.js",
    "/chats/cards.js",
    "/chats/cardview.js",
    "/chats/links.js",
    "/chats/roof/service.js",
    "/chats/roof/core.js",
    "/chats/roof/idb.js",
    "/chats/crypto.js",
    "/chats/digest.js",
    "/chats/roof/chats.css",
    "/chats/roof/chsheets.css",
    "/chats/cards.css",
  ],
  lazy: ["/chats/roof/send.js", "/chats/roof/sheets.js", "/chats/roof/settings.js", "/chats/roof/media.js", "/chats/rank.js", "/chats/qr.js"],
  preload: ["/chats/roof/chats.js", "/chats/roof/connector.js"],
  mini(answer) {
    const u = answer?.cards?.chat?.unread;
    const n = Array.isArray(u) ? u.reduce((s, r) => s + (Number(r?.n) > 0 ? Number(r.n) : 0), 0) : 0;
    return n > 0 ? { kind: "num", num: String(n), label: "Unread" } : null;
  },
};
