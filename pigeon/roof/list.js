// Chats' list (the Chats section: In the Air, pinned then recent chats and groups, the requests banner, the key warning; vMessages).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-A's to write.
// view(el, ctx) → { show(route), hide(), busy(), unmount() } (el: its section or host; ctx = { fw, svc, store, open }).
// Openers (each returns the sheet handle): openNewChat(ctx) → newmsg, openNewGroup(ctx) → newgroup.
import { normCard } from "../cards.js";
void normCard;
export const STUB = true;
const stub = (ctx, sheet, title) => ctx.fw.sheet.open({ sheet, title, body: ctx.fw.ui.empty({ title, body: "Not built yet." }) });

export function view(el, ctx) {
  void ctx;
  return { show() { el.hidden = false; }, hide() { el.hidden = true; }, busy: () => false, unmount() { el.replaceChildren(); } };
}
export function openNewChat(ctx) { return stub(ctx, "newmsg", "New Chat"); }
export function openNewGroup(ctx) { return stub(ctx, "newgroup", "New Group"); }
