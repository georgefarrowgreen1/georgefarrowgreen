// What a friend said, in a line, for Today's Waiting for You (Today First, spec §7.4): run by Chat's engine on the
// phone, over messages it has just decrypted in memory, so the words never leave it. Pure: no fetch, no storage, and it
// imports nothing.
//   waitingDigest(items: [{ id, first, at, msgs: [{ text, card?, plan?, when?, at }] }], { stocks, now })
//   → [{ id, first, at, said, kind: "invite" | "ask" | "question" | "message", topics }]: said, the newest messages
//     joined and cut at 90 characters; topics, from the cards and from your holdings' names or symbols in any of them
// (B0's stub: nothing said. Batch C2 writes it; the name and arguments stay.)
export function waitingDigest(items, opts) {
  return [];
}
