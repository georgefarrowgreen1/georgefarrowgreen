// A chat or group (vChat, vGroupChat): messages, flights, cards, reactions, the composer, S3-D17's scroller (fw.fill,
// fw.tabs.away, visualViewport removed on hide), the 1 s ticker, the draft flushed on hidden.
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-A's to write.
// view(el, ctx) → { show(route), hide(), busy(), unmount() } (el: its section or host; ctx = { fw, svc, store, open }).
import { cardHtml } from "../cardview.js";
import { normCard } from "../cards.js";
import { linkParts } from "../links.js";
void cardHtml; void normCard; void linkParts;
export const STUB = true;

export function view(el, ctx) {
  void ctx;
  return { show() { el.hidden = false; }, hide() { el.hidden = true; }, busy: () => false, unmount() { el.replaceChildren(); } };
}
