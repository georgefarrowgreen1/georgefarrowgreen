// Chat Settings (§2.6): Privacy & Security is a link to Chat's own page, /chats/in/#account (S3-D8).
// B0's stub (One roof, stage 3: roof/s3/spec.md §2.2, §3.1; frozen exports, the agreed imports), UI-B's to write.
// Each opener opens its sheet (fw.sheet.open, data-sheet as roofhooks.mjs names it) and returns the handle;
// ctx = { fw, svc, store, open } (open.*: the bound openers). The stub opens a placeholder sheet only.
export const STUB = true;
const stub = (ctx, sheet, title) => ctx.fw.sheet.open({ sheet, title, body: ctx.fw.ui.empty({ title, body: "Not built yet." }) });

export function openChatSettings(ctx, page = null) { void page; return stub(ctx, "chatsettings", "Chat Settings"); }
