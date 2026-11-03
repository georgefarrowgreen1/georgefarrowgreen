// Chats' connector (One roof, stage 3: spec §5.3; s24-contracts §5, §8): what Chats shares with InFlite, read by the
// framework without loading the module. ≤ 4096 bytes raw, no imports. No search here: Chats' search needs the core, so
// it is the frame's own provider (connectors.js chatsProvider, §2.4).
// files = the entry's static import graph + the core's graph (rank.js excepted) + REGISTRY's css; lazy = the kept-offline
// sheets; preload = only the entry and this file (the graph is fetched under stamped URLs, S3-C1). flight.js, scan.js,
// the geodata and jsqr.js are network-only. mini(answer): Today's chat card's unread count, a number only.
export const CONNECTOR = 1;
const SECTIONS = [["chats", "Chats"], ["friends", "Friends"]];
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
  sections: SECTIONS,
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
  lazy: ["/chats/roof/send.js", "/chats/roof/sheets.js", "/chats/roof/settings.js", "/chats/roof/media.js"],
  preload: ["/chats/roof/chats.js", "/chats/roof/connector.js"],
  mini(a) {
    const u = a?.cards?.chat?.unread;
    const n = Array.isArray(u) ? u.reduce((s, r) => s + (Number(r?.n) || 0), 0) : Number(u) || 0;
    return n > 0 ? { kind: "num", num: String(n), label: "Unread" } : null;
  },
};
