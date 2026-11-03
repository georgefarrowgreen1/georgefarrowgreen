// Chats' sheets: friend and group info, safety numbers, a message's view, hold menus (S3-D7, §2.2).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-B's to write.
// Each opener opens its sheet (fw.sheet.open, data-sheet as roofhooks.mjs names it) and returns the handle;
// ctx = { fw, svc, store, open } (open.*: the bound openers). The stub opens a placeholder sheet only.
import { cardHtml } from "../cardview.js";
void cardHtml;
export const STUB = true;
const stub = (ctx, sheet, title) => ctx.fw.sheet.open({ sheet, title, body: ctx.fw.ui.empty({ title, body: "Not built yet." }) });

export function openFriendInfo(ctx, id) { void id; return stub(ctx, "friendinfo", "Friend"); }
export function openGroupInfo(ctx, id) { void id; return stub(ctx, "groupinfo", "Group"); }
export function openGroupAdd(ctx, id) { void id; return stub(ctx, "groupadd", "Add to Group"); }
export function openGroupRename(ctx, id) { void id; return stub(ctx, "grouprename", "Rename Group"); }
export function openSafety(ctx, id) { void id; return stub(ctx, "safety", "Safety Number"); }
export function openWhoHas(ctx, msgId) { void msgId; return stub(ctx, "whohas", "Who Has It"); }
export function openView(ctx, msgId) { void msgId; return stub(ctx, "view", "Message"); }
export function openSchedule(ctx, id) { void id; return stub(ctx, "schedule", "Send Later"); }
export function openTimeTalk(ctx, id) { void id; return stub(ctx, "timetalk", "Time to Talk"); }
export function openFromApps(ctx, id) { void id; return stub(ctx, "fromapps", "From Your Apps"); }
export function openHold(ctx, target) { void target; return stub(ctx, "hold", "Message"); }
