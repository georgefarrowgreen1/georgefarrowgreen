// Chats' Friends section (friends' news, friends, groups, blocked; vFriends).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-A's to write.
// view(el, ctx) → { show(route), hide(), busy(), unmount() } (el: its section or host; ctx = { fw, svc, store, open }).
// Openers (each returns the sheet handle): openRequests(ctx) → requests, openAddFriend(ctx, handle = null) → addfriend.
export const STUB = true;
const stub = (ctx, sheet, title) => ctx.fw.sheet.open({ sheet, title, body: ctx.fw.ui.empty({ title, body: "Not built yet." }) });

export function view(el, ctx) {
  void ctx;
  return { show() { el.hidden = false; }, hide() { el.hidden = true; }, busy: () => false, unmount() { el.replaceChildren(); } };
}
export function openRequests(ctx) { return stub(ctx, "requests", "Requests"); }
export function openAddFriend(ctx, handle = null) { void handle; return stub(ctx, "addfriend", "Add Friend"); }
